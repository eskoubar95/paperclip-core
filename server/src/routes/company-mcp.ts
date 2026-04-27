import type { Request } from "express";
import { Router as createRouter } from "express";
import type { Db } from "@paperclipai/db";
import { companies } from "@paperclipai/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { validate } from "../middleware/validate.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";
import { secretService } from "../services/secrets.js";
import { companyMcpService, MCP_PROVIDER_KEYS } from "../services/company-mcp.js";
import { mcpOAuthService } from "../services/mcp-oauth.js";

const createMcpSchema = z.object({
  key: z.string().min(1).max(64),
  displayName: z.string().min(1).max(200),
  providerKey: z.enum(MCP_PROVIDER_KEYS as unknown as [string, ...string[]]),
  config: z.record(z.unknown()).optional(),
  token: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
  oauthProvider: z.enum(["notion", "context7"]).optional().nullable(),
});

const oauthConnectSchema = z.object({
  integrationId: z.string().uuid(),
});

const updateMcpSchema = z.object({
  displayName: z.string().min(1).max(200).optional(),
  config: z.record(z.unknown()).optional(),
  token: z.string().optional().nullable(),
  enabled: z.boolean().optional(),
});

const agentBindingsSchema = z.object({
  bindings: z
    .array(
      z.object({
        mcpIntegrationId: z.string().uuid(),
        permission: z.enum(["read", "write", "full"]),
      }),
    )
    .default([]),
});

const createSyncTokenSchema = z.object({
  name: z.string().min(1).max(200).default("Local sync"),
});

function boardActor(req: Request) {
  return req.actor.type === "board"
    ? { userId: req.actor.userId ?? null, agentId: null as string | null }
    : { userId: null as string | null, agentId: (req as { actor: { agentId?: string } }).actor.agentId ?? null };
}

export function companyMcpRoutes(db: Db) {
  const router = createRouter();
  const secretsSvc = secretService(db);
  const mcp = companyMcpService(db, secretsSvc);
  const oauthSvc = mcpOAuthService(db, secretsSvc);

  router.get("/:companyId/mcp/integrations", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ integrations: await mcp.list(companyId) });
  });

  router.post("/:companyId/mcp/integrations", validate(createMcpSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as z.infer<typeof createMcpSchema>;
    const row = await mcp.create(companyId, { ...body, oauthProvider: body.oauthProvider ?? null }, boardActor(req));
    res.status(201).json({ integration: row });
  });

  router.post(
    "/:companyId/mcp/oauth/connect",
    validate(oauthConnectSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const { integrationId } = req.body as z.infer<typeof oauthConnectSchema>;
      const out = await oauthSvc.initiateOAuth(companyId, integrationId, boardActor(req));
      res.json({ authUrl: out.authUrl, integrationId: out.integrationId });
    },
  );

  router.get("/:companyId/mcp/oauth/callback/:integrationId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const integrationId = req.params.integrationId as string;
    const code = typeof req.query.code === "string" ? req.query.code : null;
    const state = typeof req.query.state === "string" ? req.query.state : null;
    if (!code || !state) {
      res.status(400).send("Missing code or state");
      return;
    }
    const actor =
      req.actor.type === "board"
        ? { userId: req.actor.userId ?? null, agentId: null as string | null }
        : { userId: null as string | null, agentId: null as string | null };
    const result = await oauthSvc.handleCallback(companyId, integrationId, code, state, actor);
    const [co] = await db
      .select({ issuePrefix: companies.issuePrefix })
      .from(companies)
      .where(eq(companies.id, companyId))
      .limit(1);
    const prefix = co?.issuePrefix ? encodeURIComponent(co.issuePrefix) : "PAP";
    if (result.ok) {
      res.redirect(302, `/${prefix}/company/settings?mcp_oauth=ok`);
    } else {
      res.redirect(
        302,
        `/${prefix}/company/settings?mcp_oauth=error&reason=${encodeURIComponent(result.error)}`,
      );
    }
  });

  router.patch(
    "/:companyId/mcp/integrations/:id",
    validate(updateMcpSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const out = await mcp.update(companyId, req.params.id as string, req.body, boardActor(req));
      if (!out) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ integration: out });
    },
  );

  router.delete("/:companyId/mcp/integrations/:id", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const out = await mcp.delete(companyId, req.params.id as string);
    if (!out) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.post("/:companyId/mcp/integrations/:id/verify", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const result = await mcp.verify(companyId, req.params.id as string);
    if (result.error === "not_found") {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json(result);
  });

  async function tryAuthorizeBundle(
    req: Request,
    companyId: string,
  ): Promise<"board" | { kind: "sync"; tokenId: string } | null> {
    const auth = req.header("authorization");
    if (auth?.toLowerCase().startsWith("bearer ")) {
      const t = auth.slice(7).trim();
      if (t.startsWith("pcpmcp_")) {
        const row = await mcp.assertSyncToken(companyId, t);
        if (row) {
          return { kind: "sync", tokenId: row.id };
        }
        return null;
      }
    }
    try {
      assertBoard(req);
      assertCompanyAccess(req, companyId);
      return "board";
    } catch {
      return null;
    }
  }

  /**
   * Cursor-compatible JSON root (wrap with { mcpServers: ... } in client if needed).
   * We return the full file shape: `{ mcpServers: { ... } }` per Cursor docs.
   */
  router.get("/:companyId/mcp/cursor-mcp.json", async (req, res) => {
    const companyId = req.params.companyId as string;
    const authz = await tryAuthorizeBundle(req, companyId);
    if (!authz) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    if (authz !== "board" && authz.kind === "sync") {
      await mcp.markSyncTokenUsed(authz.tokenId);
    }
    const body = await mcp.buildCursorMcpJson(companyId);
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    res.setHeader("Cache-Control", "no-store");
    res.json(body);
  });

  router.get("/:companyId/mcp/sync-tokens", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json({ tokens: await mcp.listSyncTokens(companyId) });
  });

  router.post("/:companyId/mcp/sync-tokens", validate(createSyncTokenSchema), async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const body = req.body as z.infer<typeof createSyncTokenSchema>;
    const out = await mcp.createSyncToken(companyId, body.name);
    res.status(201).json(out);
  });

  router.delete("/:companyId/mcp/sync-tokens/:id", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const out = await mcp.revokeSyncToken(companyId, req.params.id as string);
    if (!out) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    res.json({ ok: true });
  });

  router.get("/:companyId/agents/:agentId/mcp-bindings", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const rows = await mcp.getAgentBindings(companyId, req.params.agentId as string);
    if (rows === null) {
      res.status(404).json({ error: "Agent not found" });
      return;
    }
    res.json({ bindings: rows });
  });

  router.put(
    "/:companyId/agents/:agentId/mcp-bindings",
    validate(agentBindingsSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const body = req.body as z.infer<typeof agentBindingsSchema>;
      await mcp.setAgentBindings(companyId, req.params.agentId as string, body.bindings);
      res.json({ ok: true });
    },
  );

  return router;
}
