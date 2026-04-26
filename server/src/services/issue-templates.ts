import { and, asc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { issueTemplates } from "@paperclipai/db";
import type { CreateIssueTemplate, IssueTemplate, UpdateIssueTemplate } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

function toRow(row: typeof issueTemplates.$inferSelect): IssueTemplate {
  return {
    id: row.id,
    companyId: row.companyId,
    projectId: row.projectId,
    name: row.name,
    description: row.description,
    defaultTeamId: row.defaultTeamId,
    defaultWorkstreamRole: row.defaultWorkstreamRole as IssueTemplate["defaultWorkstreamRole"],
    defaultStatus: row.defaultStatus,
    defaultPriority: row.defaultPriority,
    bodyTemplate: row.bodyTemplate,
    subIssueBlueprints: (row.subIssueBlueprints as unknown[]) ?? null,
    defaultLabelIds: (row.defaultLabelIds as string[] | null) ?? null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function issueTemplateService(db: Db) {
  return {
    list(companyId: string) {
      return db
        .select()
        .from(issueTemplates)
        .where(eq(issueTemplates.companyId, companyId))
        .orderBy(asc(issueTemplates.name), asc(issueTemplates.id))
        .then((rows) => rows.map(toRow));
    },

    async get(companyId: string, id: string): Promise<IssueTemplate | null> {
      const row = await db
        .select()
        .from(issueTemplates)
        .where(and(eq(issueTemplates.companyId, companyId), eq(issueTemplates.id, id)))
        .then((r) => r[0] ?? null);
      return row ? toRow(row) : null;
    },

    async create(companyId: string, input: CreateIssueTemplate) {
      const [created] = await db
        .insert(issueTemplates)
        .values({
          companyId,
          projectId: input.projectId ?? null,
          name: input.name.trim(),
          description: input.description ?? null,
          defaultTeamId: input.defaultTeamId ?? null,
          defaultWorkstreamRole: input.defaultWorkstreamRole ?? null,
          defaultStatus: input.defaultStatus ?? null,
          defaultPriority: input.defaultPriority ?? null,
          bodyTemplate: input.bodyTemplate ?? null,
          subIssueBlueprints: input.subIssueBlueprints ?? null,
          defaultLabelIds: input.defaultLabelIds ?? null,
        })
        .returning();
      if (!created) throw unprocessable("Failed to create issue template");
      return toRow(created);
    },

    async update(companyId: string, id: string, patch: UpdateIssueTemplate) {
      const existing = await this.get(companyId, id);
      if (!existing) throw notFound("Issue template not found");
      const next: Partial<typeof issueTemplates.$inferInsert> = { updatedAt: new Date() };
      if (patch.name !== undefined) next.name = patch.name.trim();
      if (patch.projectId !== undefined) next.projectId = patch.projectId;
      if (patch.description !== undefined) next.description = patch.description;
      if (patch.defaultTeamId !== undefined) next.defaultTeamId = patch.defaultTeamId;
      if (patch.defaultWorkstreamRole !== undefined) next.defaultWorkstreamRole = patch.defaultWorkstreamRole;
      if (patch.defaultStatus !== undefined) next.defaultStatus = patch.defaultStatus;
      if (patch.defaultPriority !== undefined) next.defaultPriority = patch.defaultPriority;
      if (patch.bodyTemplate !== undefined) next.bodyTemplate = patch.bodyTemplate;
      if (patch.subIssueBlueprints !== undefined) next.subIssueBlueprints = patch.subIssueBlueprints;
      if (patch.defaultLabelIds !== undefined) next.defaultLabelIds = patch.defaultLabelIds;
      const [updated] = await db
        .update(issueTemplates)
        .set(next)
        .where(and(eq(issueTemplates.companyId, companyId), eq(issueTemplates.id, id)))
        .returning();
      if (!updated) throw notFound("Issue template not found");
      return toRow(updated);
    },

    async remove(companyId: string, id: string) {
      const [removed] = await db
        .delete(issueTemplates)
        .where(and(eq(issueTemplates.companyId, companyId), eq(issueTemplates.id, id)))
        .returning();
      if (!removed) throw notFound("Issue template not found");
    },
  };
}
