import { createHash, randomBytes } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { and, desc, eq, inArray, isNull } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import {
  agentMcpBindings,
  agents,
  companyMcpIntegrations,
  companyMcpSyncTokens,
} from "@paperclipai/db";
import { notFound, unprocessable } from "../errors.js";
import type { secretService } from "./secrets.js";
import { mcpOAuthService } from "./mcp-oauth.js";
import { MCP_OAUTH_KNOWN } from "./mcp-oauth-providers.js";

type SecretsSvc = ReturnType<typeof secretService>;

const MCP_INTEGRATION_KEY_RE = /^[a-z0-9]([a-z0-9-]{0,62}[a-z0-9])?$/;

function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function createSyncToken() {
  return `pcpmcp_${randomBytes(32).toString("hex")}`;
}

/**
 * No vendor-specific npx in code — config carries command/args (e.g. npx) and the vault stores
 * static tokens (key, PAT, bearer, etc.). See doc/MCP-CONNECTORS.md for auth model guidance.
 */
export const MCP_PROVIDER_KEYS = ["http_bearer", "custom_stdio"] as const;
export type McpProviderKey = (typeof MCP_PROVIDER_KEYS)[number];

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {};
}

/**
 * Map provider + optional custom config to Cursor mcp.json entry.
 * @see https://cursor.com/docs/mcp
 */
export function buildMcpServerEntry(
  providerKey: string,
  token: string | null,
  custom: Record<string, unknown>,
): Record<string, unknown> {
  if (providerKey === "http_bearer") {
    const url = typeof custom.url === "string" && custom.url.trim() ? custom.url.trim() : null;
    if (!url) throw unprocessable("HTTP MCP requires config.url");
    if (!token) throw unprocessable("HTTP MCP requires a token secret (Authorization bearer)");
    return {
      url,
      type: "http" as const,
      headers: {
        Authorization: `Bearer ${token}`,
      },
    };
  }
  if (providerKey === "custom_stdio") {
    const command = typeof custom.command === "string" ? custom.command.trim() : "";
    const args = Array.isArray(custom.args) ? custom.args.filter((a): a is string => typeof a === "string") : [];
    if (!command) throw unprocessable("custom_stdio requires config.command");
    const env: Record<string, string> = {};
    const envMap = asRecord(custom.env);
    for (const [k, v] of Object.entries(envMap)) {
      if (typeof v === "string" && v.length > 0) env[k] = v;
    }
    if (token) {
      const tokenEnv = typeof custom.tokenEnvName === "string" ? custom.tokenEnvName : "API_KEY";
      env[tokenEnv] = token;
    }
    return {
      type: "stdio" as const,
      command,
      args,
      env: Object.keys(env).length > 0 ? env : undefined,
    };
  }
  throw unprocessable(`Unknown provider_key: ${providerKey}`);
}

async function verifyHttpMcpUrl(url: string, token: string): Promise<string | null> {
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return t.slice(0, 200) || `HTTP ${res.status}`;
    }
  } catch (e) {
    return e instanceof Error ? e.message : "Request failed";
  }
  return null;
}

type McpRow = typeof companyMcpIntegrations.$inferSelect;

export function companyMcpService(db: Db, secretsSvc: SecretsSvc) {
  const oauthSvc = mcpOAuthService(db, secretsSvc);

  async function getTokenValue(companyId: string, tokenSecretId: string | null): Promise<string | null> {
    if (!tokenSecretId) return null;
    try {
      return await secretsSvc.resolveSecretValue(companyId, tokenSecretId, "latest");
    } catch {
      return null;
    }
  }

  /**
   * Static vault token, or for OAuth rows the (possibly refreshed) access token cache.
   */
  async function resolveTokenForMcp(companyId: string, row: McpRow): Promise<string | null> {
    if (row.oauthProvider) {
      await oauthSvc.ensureFreshAccessForIntegration(companyId, row.id);
      const [fresh] = await db
        .select()
        .from(companyMcpIntegrations)
        .where(
          and(
            eq(companyMcpIntegrations.companyId, companyId),
            eq(companyMcpIntegrations.id, row.id),
          ),
        )
        .limit(1);
      return fresh?.accessTokenCache ?? null;
    }
    if (!row.tokenSecretId) return null;
    return await getTokenValue(companyId, row.tokenSecretId);
  }

  return {
    list: async (companyId: string) => {
      const rows = await db
        .select()
        .from(companyMcpIntegrations)
        .where(eq(companyMcpIntegrations.companyId, companyId))
        .orderBy(desc(companyMcpIntegrations.createdAt));
      return rows.map((r) => ({
        id: r.id,
        key: r.key,
        displayName: r.displayName,
        providerKey: r.providerKey,
        config: r.config,
        hasToken: Boolean(r.tokenSecretId),
        oauthProvider: r.oauthProvider,
        /** True when OAuth completed at least once (cached access or stored refresh). */
        oauthConnected: Boolean(
          r.oauthProvider && (r.accessTokenCache || r.refreshTokenSecretId),
        ),
        tokenExpiresAt: r.tokenExpiresAt,
        enabled: r.enabled,
        lastVerifiedAt: r.lastVerifiedAt,
        lastError: r.lastError,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));
    },

    getById: async (companyId: string, id: string) => {
      const row = await db
        .select()
        .from(companyMcpIntegrations)
        .where(and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, id)))
        .then((rows) => rows[0] ?? null);
      if (!row) return null;
      return {
        id: row.id,
        key: row.key,
        displayName: row.displayName,
        providerKey: row.providerKey,
        config: row.config,
        hasToken: Boolean(row.tokenSecretId),
        tokenSecretId: row.tokenSecretId,
        oauthProvider: row.oauthProvider,
        oauthConnected: Boolean(
          row.oauthProvider && (row.accessTokenCache || row.refreshTokenSecretId),
        ),
        tokenExpiresAt: row.tokenExpiresAt,
        enabled: row.enabled,
        lastVerifiedAt: row.lastVerifiedAt,
        lastError: row.lastError,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

    create: async (
      companyId: string,
      input: {
        key: string;
        displayName: string;
        providerKey: string;
        config?: Record<string, unknown>;
        token?: string | null;
        enabled?: boolean;
        oauthProvider?: string | null;
      },
      actor: { userId: string | null; agentId: string | null },
    ) => {
      const key = input.key.trim().toLowerCase();
      if (!MCP_INTEGRATION_KEY_RE.test(key)) {
        throw unprocessable("Invalid key: use 1-64 chars, lowercase letters, numbers, and hyphens.");
      }
      if (!MCP_PROVIDER_KEYS.includes(input.providerKey as McpProviderKey)) {
        throw unprocessable(`Invalid providerKey. Use one of: ${MCP_PROVIDER_KEYS.join(", ")}`);
      }

      const rawOauth = input.oauthProvider?.trim() || "";
      if (rawOauth && !(MCP_OAUTH_KNOWN as readonly string[]).includes(rawOauth)) {
        throw unprocessable(`Invalid oauthProvider. Use one of: ${MCP_OAUTH_KNOWN.join(", ")}`);
      }
      const oauthProvider = rawOauth
        ? (rawOauth as (typeof MCP_OAUTH_KNOWN)[number])
        : null;
      if (oauthProvider && input.providerKey !== "http_bearer") {
        throw unprocessable("OAuth integrations must use providerKey http_bearer");
      }
      const cfgPreview = asRecord(input.config ?? {});
      if (oauthProvider) {
        const url = typeof cfgPreview.url === "string" && cfgPreview.url.trim() ? cfgPreview.url.trim() : null;
        if (!url) {
          throw unprocessable("OAuth HTTP MCP requires config.url (remote MCP endpoint)");
        }
      }

      const dup = await db
        .select({ id: companyMcpIntegrations.id })
        .from(companyMcpIntegrations)
        .where(and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.key, key)))
        .then((r) => r[0] ?? null);
      if (dup) throw unprocessable(`MCP key already exists: ${key}`);

      let tokenSecretId: string | null = null;
      if (input.token && input.token.trim().length > 0) {
        const created = await secretsSvc.create(
          companyId,
          {
            name: `mcp_token_${key}`,
            provider: "local_encrypted",
            value: input.token.trim(),
            description: `MCP token for ${input.displayName}`,
          },
          actor,
        );
        tokenSecretId = created.id;
      } else {
        if (!oauthProvider && !input.token && input.providerKey === "http_bearer") {
          throw unprocessable("A token is required for http_bearer (unless using OAuth via oauthProvider)");
        }
      }

      const [row] = await db
        .insert(companyMcpIntegrations)
        .values({
          companyId,
          key,
          displayName: input.displayName.trim(),
          providerKey: input.providerKey,
          config: input.config ?? {},
          tokenSecretId,
          oauthProvider,
          enabled: input.enabled ?? true,
        })
        .returning();
      return row;
    },

    update: async (
      companyId: string,
      id: string,
      input: {
        displayName?: string;
        config?: Record<string, unknown>;
        token?: string | null;
        enabled?: boolean;
      },
      actor: { userId: string | null; agentId: string | null },
    ) => {
      const cur = await db
        .select()
        .from(companyMcpIntegrations)
        .where(and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, id)))
        .then((rows) => rows[0] ?? null);
      if (!cur) return null;

      let tokenSecretId = cur.tokenSecretId;
      if (input.token && input.token.trim().length > 0) {
        if (tokenSecretId) {
          await secretsSvc.rotate(tokenSecretId, { value: input.token.trim() }, actor);
        } else {
          const created = await secretsSvc.create(
            companyId,
            {
              name: `mcp_token_${cur.key}`,
              provider: "local_encrypted",
              value: input.token.trim(),
              description: `MCP token for ${input.displayName ?? cur.key}`,
            },
            actor,
          );
          tokenSecretId = created.id;
        }
      }

      const [row] = await db
        .update(companyMcpIntegrations)
        .set({
          displayName: input.displayName ? input.displayName.trim() : cur.displayName,
          config: input.config !== undefined ? input.config : cur.config,
          tokenSecretId,
          enabled: input.enabled !== undefined ? input.enabled : cur.enabled,
          updatedAt: new Date(),
        })
        .where(eq(companyMcpIntegrations.id, id))
        .returning();
      return row ?? null;
    },

    delete: async (companyId: string, id: string) => {
      const n = await db
        .delete(companyMcpIntegrations)
        .where(and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, id)))
        .returning({ id: companyMcpIntegrations.id });
      return n[0] ?? null;
    },

    verify: async (companyId: string, id: string) => {
      const row = await db
        .select()
        .from(companyMcpIntegrations)
        .where(and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, id)))
        .then((rows) => rows[0] ?? null);
      if (!row) return { ok: false as const, error: "not_found" as const };
      const token = await resolveTokenForMcp(companyId, row);
      const cfg = asRecord(row.config);
      let err: string | null = null;
      if (row.providerKey === "http_bearer") {
        if (!token) {
          err = row.oauthProvider ? "OAuth not connected or token unavailable" : "No token";
        } else {
          const url = typeof cfg.url === "string" && cfg.url.trim() ? cfg.url.trim() : null;
          if (url) err = await verifyHttpMcpUrl(url, token);
        }
      } else {
        err = null;
      }
      await db
        .update(companyMcpIntegrations)
        .set({
          lastVerifiedAt: new Date(),
          lastError: err,
          updatedAt: new Date(),
        })
        .where(eq(companyMcpIntegrations.id, id));
      return { ok: !err, error: err, lastVerifiedAt: new Date() };
    },

    /** Full company bundle for local sync. Option B may later filter entries by agent policy at run time. */
    buildCursorMcpJson: async (companyId: string) => {
      const rows = await db
        .select()
        .from(companyMcpIntegrations)
        .where(and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.enabled, true)))
        .orderBy(companyMcpIntegrations.key);
      const mcpServers: Record<string, unknown> = {};
      for (const row of rows) {
        if (!row.enabled) continue;
        const token = await resolveTokenForMcp(companyId, row);
        const cfg = asRecord(row.config);
        try {
          if (row.providerKey === "http_bearer" && !token) {
            mcpServers[row.key] = {
              error: "oauth_not_connected",
              message: row.oauthProvider
                ? "Connect OAuth in company MCP settings"
                : "Missing bearer token",
            };
            continue;
          }
          mcpServers[row.key] = buildMcpServerEntry(row.providerKey, token, cfg);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          mcpServers[row.key] = { error: "configuration_invalid", message };
        }
      }
      return { mcpServers };
    },

    /**
     * Write agent-scoped `.cursor/mcp.json` under run cwd for Cursor CLI (OAuth access tokens resolved).
     */
    materializeAgentCursorMcp: async (companyId: string, agentId: string, runCwd: string) => {
      const agent = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!agent) return;
      const bindings = await db
        .select()
        .from(agentMcpBindings)
        .where(eq(agentMcpBindings.agentId, agentId));
      if (bindings.length === 0) return;

      const mcpIds = bindings.map((b) => b.mcpIntegrationId);
      const rows = await db
        .select()
        .from(companyMcpIntegrations)
        .where(
          and(
            eq(companyMcpIntegrations.companyId, companyId),
            inArray(companyMcpIntegrations.id, mcpIds),
            eq(companyMcpIntegrations.enabled, true),
          ),
        )
        .orderBy(companyMcpIntegrations.key);

      const mcpServers: Record<string, unknown> = {};
      for (const row of rows) {
        const token = await resolveTokenForMcp(companyId, row);
        const cfg = asRecord(row.config);
        try {
          if (row.providerKey === "http_bearer" && !token) {
            mcpServers[row.key] = {
              error: "oauth_not_connected",
              message: row.oauthProvider
                ? "Connect OAuth in company MCP settings"
                : "Missing bearer token",
            };
            continue;
          }
          mcpServers[row.key] = buildMcpServerEntry(row.providerKey, token, cfg);
        } catch (e) {
          const message = e instanceof Error ? e.message : String(e);
          mcpServers[row.key] = { error: "configuration_invalid", message };
        }
      }

      const mcpJsonPath = join(runCwd, ".cursor", "mcp.json");
      await mkdir(join(runCwd, ".cursor"), { recursive: true });
      await writeFile(mcpJsonPath, JSON.stringify({ mcpServers }, null, 2), "utf-8");
    },

    setAgentBindings: async (
      companyId: string,
      agentId: string,
      bindings: Array<{ mcpIntegrationId: string; permission: "read" | "write" | "full" }>,
    ) => {
      const agent = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!agent) throw notFound("Agent not found");

      const mcpIds = bindings.map((b) => b.mcpIntegrationId);
      if (mcpIds.length > 0) {
        const valid = await db
          .select({ id: companyMcpIntegrations.id })
          .from(companyMcpIntegrations)
          .where(
            and(
              eq(companyMcpIntegrations.companyId, companyId),
              inArray(companyMcpIntegrations.id, mcpIds),
            ),
          );
        if (valid.length !== mcpIds.length) throw unprocessable("One or more MCP integration ids are invalid");
      }

      await db.delete(agentMcpBindings).where(eq(agentMcpBindings.agentId, agentId));
      if (bindings.length > 0) {
        await db.insert(agentMcpBindings).values(
          bindings.map((b) => ({
            agentId,
            mcpIntegrationId: b.mcpIntegrationId,
            permission: b.permission,
          })),
        );
      }
    },

    getAgentBindings: async (companyId: string, agentId: string) => {
      const agent = await db
        .select()
        .from(agents)
        .where(and(eq(agents.id, agentId), eq(agents.companyId, companyId)))
        .then((r) => r[0] ?? null);
      if (!agent) return null;
      return db
        .select()
        .from(agentMcpBindings)
        .where(eq(agentMcpBindings.agentId, agentId));
    },

    listSyncTokens: async (companyId: string) => {
      return db
        .select({
          id: companyMcpSyncTokens.id,
          name: companyMcpSyncTokens.name,
          createdAt: companyMcpSyncTokens.createdAt,
          lastUsedAt: companyMcpSyncTokens.lastUsedAt,
          revokedAt: companyMcpSyncTokens.revokedAt,
        })
        .from(companyMcpSyncTokens)
        .where(eq(companyMcpSyncTokens.companyId, companyId))
        .orderBy(desc(companyMcpSyncTokens.createdAt));
    },

    createSyncToken: async (companyId: string, name: string) => {
      const token = createSyncToken();
      const tokenHash = hashToken(token);
      const [row] = await db
        .insert(companyMcpSyncTokens)
        .values({ companyId, name: name.trim() || "Local sync", tokenHash })
        .returning();
      return { id: row.id, name: row.name, token, createdAt: row.createdAt };
    },

    revokeSyncToken: async (companyId: string, tokenId: string) => {
      const n = await db
        .update(companyMcpSyncTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(companyMcpSyncTokens.companyId, companyId), eq(companyMcpSyncTokens.id, tokenId)))
        .returning();
      return n[0] ?? null;
    },

    assertSyncToken: async (companyId: string, token: string) => {
      const h = hashToken(token);
      const row = await db
        .select()
        .from(companyMcpSyncTokens)
        .where(
          and(
            eq(companyMcpSyncTokens.companyId, companyId),
            eq(companyMcpSyncTokens.tokenHash, h),
            isNull(companyMcpSyncTokens.revokedAt),
          ),
        )
        .then((r) => r[0] ?? null);
      if (!row) return null;
      if (row.revokedAt) return null;
      return row;
    },

    markSyncTokenUsed: async (tokenId: string) => {
      await db
        .update(companyMcpSyncTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(companyMcpSyncTokens.id, tokenId));
    },
  };
}
