import { Router } from "express";
import type { Db } from "@paperclipai/db";
import {
  batchKickoffSchema,
  companyIssueWebhookSchema,
  createIssueTemplateSchema,
  createTeamMembershipSchema,
  createTeamSchema,
  updateIssueTemplateSchema,
  updateTeamSchema,
} from "@paperclipai/shared";
import { validate } from "../middleware/validate.js";
import { z } from "zod";
import {
  issueService,
  issueTemplateService,
  companyIssueWebhookService,
  teamService,
} from "../services/index.js";
import { assertCompanyAccess, getActorInfo } from "./authz.js";

export function teamRoutes(db: Db) {
  const router = Router();
  const teams = teamService(db);
  const templates = issueTemplateService(db);
  const webhooks = companyIssueWebhookService(db);
  const issueSvc = issueService(db);

  router.get("/:companyId/team-memberships/by-agent", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await teams.listAgentTeamAffiliationsForCompany(companyId));
  });

  router.get("/:companyId/teams", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const includeArchived = req.query.includeArchived === "true" || req.query.includeArchived === "1";
    res.json(await teams.list(companyId, includeArchived));
  });

  router.post("/:companyId/teams", validate(createTeamSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const created = await teams.create(companyId, req.body);
    res.status(201).json(created);
  });

  router.patch("/:companyId/teams/:teamId", validate(updateTeamSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    assertCompanyAccess(req, companyId);
    const updated = await teams.update(companyId, teamId, req.body);
    res.json(updated);
  });

  router.get("/:companyId/teams/:teamId/memberships", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    assertCompanyAccess(req, companyId);
    const rows = await teams.listMemberships(teamId, companyId);
    res.json(rows.map((r) => teams.toMembershipRow(r)));
  });

  router.post(
    "/:companyId/teams/:teamId/memberships",
    validate(createTeamMembershipSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const teamId = req.params.teamId as string;
      assertCompanyAccess(req, companyId);
      const row = await teams.addMembership(companyId, teamId, req.body);
      res.status(201).json(teams.toMembershipRow(row));
    },
  );

  router.delete("/:companyId/teams/:teamId/memberships/:membershipId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const teamId = req.params.teamId as string;
    const membershipId = req.params.membershipId as string;
    assertCompanyAccess(req, companyId);
    await teams.removeMembership(companyId, teamId, membershipId);
    res.json({ ok: true });
  });

  router.get("/:companyId/issue-templates", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await templates.list(companyId));
  });

  router.post("/:companyId/issue-templates", validate(createIssueTemplateSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const created = await templates.create(companyId, req.body);
    res.status(201).json(created);
  });

  router.patch(
    "/:companyId/issue-templates/:templateId",
    validate(updateIssueTemplateSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const templateId = req.params.templateId as string;
      assertCompanyAccess(req, companyId);
      res.json(await templates.update(companyId, templateId, req.body));
    },
  );

  router.delete("/:companyId/issue-templates/:templateId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const templateId = req.params.templateId as string;
    assertCompanyAccess(req, companyId);
    await templates.remove(companyId, templateId);
    res.json({ ok: true });
  });

  router.get("/:companyId/issue-webhooks", async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    res.json(await webhooks.list(companyId));
  });

  router.post("/:companyId/issue-webhooks", validate(companyIssueWebhookSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const created = await webhooks.create(companyId, req.body);
    res.status(201).json(created);
  });

  router.delete("/:companyId/issue-webhooks/:webhookId", async (req, res) => {
    const companyId = req.params.companyId as string;
    const webhookId = req.params.webhookId as string;
    assertCompanyAccess(req, companyId);
    await webhooks.remove(companyId, webhookId);
    res.json({ ok: true });
  });

  const assignToRoleSchema = z
    .object({
      issueId: z.string().uuid(),
      workstreamRole: z.string().min(1),
    })
    .strict();

  router.post(
    "/:companyId/teams/:teamId/assign-to-role",
    validate(assignToRoleSchema),
    async (req, res) => {
      const companyId = req.params.companyId as string;
      const teamId = req.params.teamId as string;
      const { issueId, workstreamRole } = req.body as { issueId: string; workstreamRole: string };
      assertCompanyAccess(req, companyId);
      const picked = await teams.pickAssigneeForWorkstream(companyId, teamId, workstreamRole);
      const issue = await issueSvc.update(issueId, {
        teamId,
        workstreamRole: workstreamRole as any,
        assigneeAgentId: picked.assigneeAgentId,
        assigneeUserId: picked.assigneeUserId,
      } as any);
      if (!issue) {
        res.status(404).json({ error: "Issue not found" });
        return;
      }
      res.json(issue);
    },
  );

  router.post("/:companyId/batch-kickoff", validate(batchKickoffSchema), async (req, res) => {
    const companyId = req.params.companyId as string;
    assertCompanyAccess(req, companyId);
    const actor = getActorInfo(req);
    const { title, projectId, teamIds, templateId, createPerTeamChildren } = req.body;
    const tmpl = templateId ? await templates.get(companyId, templateId) : null;
    const parent = await issueSvc.create(companyId, {
      title,
      projectId: projectId ?? tmpl?.projectId ?? null,
      status: "backlog",
      priority: (tmpl?.defaultPriority as "medium" | undefined) ?? "medium",
      createdByAgentId: actor.agentId,
      createdByUserId: actor.actorType === "user" ? actor.actorId : null,
    } as any);
    const childIssueIds: string[] = [];
    if (createPerTeamChildren) {
      for (const teamId of teamIds) {
        const child = await issueSvc.create(companyId, {
          parentId: parent.id,
          title: `${title} (team)`,
          projectId: projectId ?? parent.projectId ?? tmpl?.projectId ?? null,
          teamId,
          workstreamRole: tmpl?.defaultWorkstreamRole ?? null,
          status: (tmpl?.defaultStatus as any) ?? "backlog",
          priority: (tmpl?.defaultPriority as any) ?? "medium",
          description: tmpl?.bodyTemplate ?? null,
          labelIds: tmpl?.defaultLabelIds ?? undefined,
          createdByAgentId: actor.agentId,
          createdByUserId: actor.actorType === "user" ? actor.actorId : null,
        } as any);
        childIssueIds.push(child.id);
      }
    }
    res.status(201).json({ parentIssueId: parent.id, childIssueIds });
  });

  return router;
}
