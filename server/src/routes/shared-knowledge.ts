import { Router } from "express";
import { z } from "zod";
import type { Db } from "@paperclipai/db";
import { sharedKnowledgeService } from "../services/shared-knowledge.js";
import { assertCompanyAccess } from "./authz.js";
import { validate } from "../middleware/validate.js";
import { notFound } from "../errors.js";
import { agentService } from "../services/agents.js";

const createKnowledgeBody = z.object({
  title: z.string().min(1).max(500),
  body: z.string().min(1).max(20_000),
  kind: z.enum(["note", "fact", "decision"]).optional().default("note"),
  issueId: z.string().uuid().optional().nullable(),
  projectId: z.string().uuid().optional().nullable(),
  sourceRunId: z.string().uuid().optional().nullable(),
  confidence: z.string().max(200).optional().nullable(),
  visibility: z.enum(["agent", "project", "company"]).optional().default("agent"),
});

export function sharedKnowledgeRoutes(db: Db) {
  const router = Router();
  const knowledge = sharedKnowledgeService(db);
  const agents = agentService(db);

  async function assertAgentInCompany(companyId: string, agentId: string) {
    const agent = await agents.getById(agentId);
    if (!agent || agent.companyId !== companyId) {
      throw notFound("Agent not found");
    }
  }

  router.get("/companies/:companyId/agents/:agentId/shared-knowledge/summaries", async (req, res, next) => {
    try {
      const { companyId, agentId } = req.params;
      assertCompanyAccess(req, companyId);
      await assertAgentInCompany(companyId, agentId);
      const limit = Number.parseInt(String(req.query.limit ?? "20"), 10);
      const rows = await knowledge.listRecentSummaries(companyId, agentId, limit);
      res.json({ summaries: rows });
    } catch (err) {
      next(err);
    }
  });

  router.get("/companies/:companyId/agents/:agentId/shared-knowledge/items", async (req, res, next) => {
    try {
      const { companyId, agentId } = req.params;
      assertCompanyAccess(req, companyId);
      await assertAgentInCompany(companyId, agentId);
      const limit = Number.parseInt(String(req.query.limit ?? "50"), 10);
      const rows = await knowledge.listKnowledge(companyId, agentId, limit);
      res.json({ items: rows });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    "/companies/:companyId/agents/:agentId/shared-knowledge/items",
    validate(createKnowledgeBody),
    async (req, res, next) => {
      try {
        const { companyId, agentId } = req.params;
        assertCompanyAccess(req, companyId);
        await assertAgentInCompany(companyId, agentId);
        if (!knowledge.isEnabled()) {
          res.status(400).json({ error: "Shared knowledge is disabled (PAPERCLIP_SHARED_KNOWLEDGE=0)" });
          return;
        }
        const body = req.body as z.infer<typeof createKnowledgeBody>;
        const [row] = await knowledge.createKnowledgeItem({
          companyId,
          agentId,
          issueId: body.issueId ?? null,
          projectId: body.projectId ?? null,
          sourceRunId: body.sourceRunId ?? null,
          kind: body.kind,
          title: body.title,
          body: body.body,
          confidence: body.confidence ?? null,
          visibility: body.visibility,
        });
        res.status(201).json({ item: row });
      } catch (err) {
        next(err);
      }
    },
  );

  return router;
}
