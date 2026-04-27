import { createHash, randomBytes } from "node:crypto";
import { and, eq, isNotNull, isNull, or, lt } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyMcpIntegrations } from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import type { secretService } from "./secrets.js";
import {
  getMcpOauthClientCredentials,
  getMcpOauthEndpoints,
  type McpOauthProviderId,
  MCP_OAUTH_KNOWN,
} from "./mcp-oauth-providers.js";

type SecretsSvc = ReturnType<typeof secretService>;

type OauthStatePayload = {
  state: string;
  codeVerifier: string;
  createdAt: number;
};

const OAUTH_STATE_TTL_MS = 15 * 60 * 1000;

function base64Url(buf: Buffer): string {
  return buf.toString("base64url");
}

function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = base64Url(randomBytes(32));
  const codeChallenge = base64Url(createHash("sha256").update(codeVerifier).digest());
  return { codeVerifier, codeChallenge };
}

function resolvePublicBaseUrl(): string {
  const raw =
    process.env.PAPERCLIP_API_URL?.trim() ||
    process.env.PAPERCLIP_AUTH_PUBLIC_BASE_URL?.trim() ||
    process.env.BETTER_AUTH_URL?.trim() ||
    "http://127.0.0.1:3100";
  return raw.replace(/\/$/, "");
}

function isMcpOauthProvider(v: string | null | undefined): v is McpOauthProviderId {
  return v !== null && v !== undefined && (MCP_OAUTH_KNOWN as readonly string[]).includes(v);
}

export function mcpOAuthService(db: Db, secretsSvc: SecretsSvc) {
  function callbackPath(companyId: string, integrationId: string): string {
    return `/api/companies/${companyId}/mcp/oauth/callback/${integrationId}`;
  }

  async function refreshAccessTokenInner(companyId: string, integrationId: string) {
    const row = await db
      .select()
      .from(companyMcpIntegrations)
      .where(
        and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, integrationId)),
      )
      .then((r) => r[0] ?? null);
    if (!row || !isMcpOauthProvider(row.oauthProvider) || !row.refreshTokenSecretId) {
      return { ok: false as const, error: "not_oauth" };
    }
    const provider = row.oauthProvider as McpOauthProviderId;
    const creds = getMcpOauthClientCredentials(provider);
    if (!creds) return { ok: false as const, error: "no_client_creds" };
    let refresh: string;
    try {
      refresh = await secretsSvc.resolveSecretValue(companyId, row.refreshTokenSecretId, "latest");
    } catch {
      return { ok: false as const, error: "no_refresh" };
    }
    const endpoints = getMcpOauthEndpoints(provider);
    const tokenRes = await fetch(endpoints.tokenEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        grant_type: "refresh_token",
        refresh_token: refresh,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      }),
    });
    const tokenJson = (await tokenRes.json().catch(() => null)) as Record<string, unknown> | null;
    if (!tokenRes.ok || !tokenJson || typeof tokenJson.access_token !== "string") {
      return { ok: false as const, error: "refresh_failed" };
    }
    const accessToken = tokenJson.access_token;
    const expiresIn =
      typeof tokenJson?.expires_in === "number" && Number.isFinite(tokenJson.expires_in)
        ? (tokenJson.expires_in as number)
        : 3600;
    const tokenExpiresAt = new Date(Date.now() + Math.max(60, expiresIn) * 1000);
    await db
      .update(companyMcpIntegrations)
      .set({
        accessTokenCache: accessToken,
        tokenExpiresAt,
        lastError: null,
        updatedAt: new Date(),
      })
      .where(eq(companyMcpIntegrations.id, integrationId));
    return { ok: true as const };
  }

  return {
    resolvePublicBaseUrl,

    /**
     * Start OAuth: returns authorize URL. Stores PKCE + state on the integration row.
     */
    initiateOAuth: async (
      companyId: string,
      integrationId: string,
      actor: { userId: string | null; agentId: string | null },
    ) => {
      const row = await db
        .select()
        .from(companyMcpIntegrations)
        .where(
          and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, integrationId)),
        )
        .then((r) => r[0] ?? null);
      if (!row) throw unprocessable("MCP integration not found");
      if (!isMcpOauthProvider(row.oauthProvider)) {
        throw unprocessable("Integration is not configured for OAuth (set oauthProvider to notion or context7)");
      }
      const provider = row.oauthProvider as McpOauthProviderId;
      const creds = getMcpOauthClientCredentials(provider);
      if (!creds) {
        throw unprocessable(
          provider === "notion"
            ? "Set PAPERCLIP_MCP_OAUTH_NOTION_CLIENT_ID and PAPERCLIP_MCP_OAUTH_NOTION_CLIENT_SECRET"
            : "Set PAPERCLIP_MCP_OAUTH_CONTEXT7_CLIENT_ID and PAPERCLIP_MCP_OAUTH_CONTEXT7_CLIENT_SECRET",
        );
      }
      const endpoints = getMcpOauthEndpoints(provider);
      const { codeVerifier, codeChallenge } = generatePkce();
      const state = base64Url(randomBytes(24));
      const payload: OauthStatePayload = {
        state,
        codeVerifier,
        createdAt: Date.now(),
      };
      const redirectUri = `${resolvePublicBaseUrl()}${callbackPath(companyId, integrationId)}`;
      const params = new URLSearchParams({
        response_type: "code",
        client_id: creds.clientId,
        redirect_uri: redirectUri,
        scope: endpoints.scopes,
        state,
        code_challenge: codeChallenge,
        code_challenge_method: "S256",
      });
      const authUrl = `${endpoints.authorizationEndpoint}?${params.toString()}`;
      await db
        .update(companyMcpIntegrations)
        .set({ oauthState: JSON.stringify(payload), updatedAt: new Date() })
        .where(eq(companyMcpIntegrations.id, integrationId));
      return { authUrl, integrationId, redirectUri };
    },

    /**
     * OAuth redirect handler: exchange code, store tokens.
     */
    handleCallback: async (
      companyId: string,
      integrationId: string,
      code: string,
      state: string,
      actor: { userId: string | null; agentId: string | null },
    ) => {
      const row = await db
        .select()
        .from(companyMcpIntegrations)
        .where(
          and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, integrationId)),
        )
        .then((r) => r[0] ?? null);
      if (!row || !isMcpOauthProvider(row.oauthProvider)) {
        return { ok: false as const, error: "integration_not_found" };
      }
      const provider = row.oauthProvider as McpOauthProviderId;
      let stored: OauthStatePayload;
      try {
        stored = JSON.parse(row.oauthState ?? "null") as OauthStatePayload;
      } catch {
        return { ok: false as const, error: "invalid_stored_state" };
      }
      if (!stored?.state || stored.state !== state) {
        return { ok: false as const, error: "state_mismatch" };
      }
      if (Date.now() - stored.createdAt > OAUTH_STATE_TTL_MS) {
        return { ok: false as const, error: "state_expired" };
      }
      const creds = getMcpOauthClientCredentials(provider);
      if (!creds) {
        return { ok: false as const, error: "oauth_not_configured" };
      }
      const endpoints = getMcpOauthEndpoints(provider);
      const redirectUri = `${resolvePublicBaseUrl()}${callbackPath(companyId, integrationId)}`;
      const tokenBody: Record<string, string> = {
        grant_type: "authorization_code",
        code,
        redirect_uri: redirectUri,
        client_id: creds.clientId,
        client_secret: creds.clientSecret,
      };
      if (stored.codeVerifier) {
        tokenBody.code_verifier = stored.codeVerifier;
      }
      const tokenRes = await fetch(endpoints.tokenEndpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(tokenBody),
      });
      const tokenJson = (await tokenRes.json().catch(() => null)) as Record<string, unknown> | null;
      if (!tokenRes.ok) {
        const err =
          (tokenJson && typeof tokenJson.error === "string" && tokenJson.error) ||
          (await tokenRes.text().catch(() => "")) ||
          `HTTP ${tokenRes.status}`;
        await db
          .update(companyMcpIntegrations)
          .set({ lastError: `OAuth token: ${err.slice(0, 500)}`, updatedAt: new Date() })
          .where(eq(companyMcpIntegrations.id, integrationId));
        return { ok: false as const, error: "token_exchange_failed" };
      }
      const accessToken = typeof tokenJson?.access_token === "string" ? tokenJson.access_token : null;
      const refreshToken = typeof tokenJson?.refresh_token === "string" ? tokenJson.refresh_token : null;
      if (!accessToken) {
        return { ok: false as const, error: "no_access_token" };
      }
      const expiresIn =
        typeof tokenJson?.expires_in === "number" && Number.isFinite(tokenJson.expires_in)
          ? (tokenJson.expires_in as number)
          : 3600;
      const tokenExpiresAt = new Date(Date.now() + Math.max(60, expiresIn) * 1000);

      let refreshSecretId = row.refreshTokenSecretId;
      if (refreshToken) {
        if (refreshSecretId) {
          await secretsSvc.rotate(refreshSecretId, { value: refreshToken }, actor);
        } else {
          const created = await secretsSvc.create(
            companyId,
            {
              name: `mcp_oauth_refresh_${row.key}`,
              provider: "local_encrypted",
              value: refreshToken,
              description: `OAuth refresh token for ${row.displayName}`,
            },
            { userId: actor.userId ?? null, agentId: actor.agentId ?? null },
          );
          refreshSecretId = created.id;
        }
      }

      await db
        .update(companyMcpIntegrations)
        .set({
          refreshTokenSecretId: refreshSecretId,
          accessTokenCache: accessToken,
          tokenExpiresAt,
          oauthState: null,
          lastError: null,
          lastVerifiedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(companyMcpIntegrations.id, integrationId));
      return { ok: true as const };
    },

    refreshAccessToken: refreshAccessTokenInner,

    /** Called before materializing MCP — refresh if expiring in <5 min. */
    ensureFreshAccessForIntegration: async (companyId: string, integrationId: string) => {
      const row = await db
        .select()
        .from(companyMcpIntegrations)
        .where(
          and(eq(companyMcpIntegrations.companyId, companyId), eq(companyMcpIntegrations.id, integrationId)),
        )
        .then((r) => r[0] ?? null);
      if (!row || !isMcpOauthProvider(row.oauthProvider) || !row.refreshTokenSecretId) {
        return;
      }
      const exp = row.tokenExpiresAt ? new Date(row.tokenExpiresAt) : null;
      const need =
        !row.accessTokenCache || !exp || exp.getTime() < Date.now() + 5 * 60 * 1000;
      if (need) {
        await refreshAccessTokenInner(companyId, integrationId);
      }
    },

    listIntegrationsNeedingRefresh: async () => {
      const before = new Date(Date.now() + 10 * 60 * 1000);
      return db
        .select()
        .from(companyMcpIntegrations)
        .where(
          and(
            isNotNull(companyMcpIntegrations.refreshTokenSecretId),
            isNotNull(companyMcpIntegrations.oauthProvider),
            or(
              isNull(companyMcpIntegrations.tokenExpiresAt),
              lt(companyMcpIntegrations.tokenExpiresAt, before),
            ),
          ),
        );
    },
  };
}