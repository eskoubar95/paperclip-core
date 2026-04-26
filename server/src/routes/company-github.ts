import { Router } from "express";
import type { Db } from "@paperclipai/db";
import { z } from "zod";
import { badRequest } from "../errors.js";
import { validate } from "../middleware/validate.js";
import { companyGithubService } from "../services/company-github.js";
import { secretService } from "../services/secrets.js";
import { assertBoard, assertCompanyAccess } from "./authz.js";

const GITHUB_REPO_LIST_MIN_INTERVAL_MS = 3_000;
const lastGithubRepoListAtByCompany = new Map<string, number>();

const upsertGithubIntegrationSchema = z.object({
  pat: z.string().optional(),
  allowedRepoFullNames: z.array(z.string()).default([]),
});

export function companyGithubRoutes(db: Db) {
  const router = Router();
  const secretsSvc = secretService(db);
  const github = companyGithubService(db, secretsSvc);

  router.get("/:companyId/github/integration", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const row = await github.getIntegration(companyId);
    res.json({
      configured: Boolean(row?.patSecretId),
      provider: row?.provider ?? "github_pat",
      allowedRepoFullNames: row?.allowedRepoFullNames ?? [],
      patSecretId: row?.patSecretId ?? null,
    });
  });

  router.get("/:companyId/github/repos", async (req, res) => {
    assertBoard(req);
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const now = Date.now();
    const last = lastGithubRepoListAtByCompany.get(companyId) ?? 0;
    if (now - last < GITHUB_REPO_LIST_MIN_INTERVAL_MS) {
      throw badRequest("Wait a few seconds before refreshing the GitHub repository list again.");
    }
    lastGithubRepoListAtByCompany.set(companyId, now);
    const repos = await github.listReposFromGithub(companyId);
    res.json({ repos });
  });

  router.put(
    "/:companyId/github/integration",
    validate(upsertGithubIntegrationSchema),
    async (req, res) => {
      assertBoard(req);
      const companyId = req.params.companyId as string;
      assertCompanyAccess(req, companyId);
      const body = req.body as z.infer<typeof upsertGithubIntegrationSchema>;
      const actor =
        req.actor.type === "board"
          ? { userId: req.actor.userId ?? null, agentId: null }
          : { userId: null, agentId: req.actor.agentId ?? null };
      const row = await github.upsertIntegration(
        companyId,
        { pat: body.pat, allowedRepoFullNames: body.allowedRepoFullNames },
        actor,
      );
      res.json({
        configured: Boolean(row?.patSecretId),
        provider: row?.provider ?? "github_pat",
        allowedRepoFullNames: row?.allowedRepoFullNames ?? [],
        patSecretId: row?.patSecretId ?? null,
      });
    },
  );

  return router;
}
