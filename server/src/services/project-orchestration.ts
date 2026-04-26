import type { Db } from "@paperclipai/db";
import { and, eq, sql } from "drizzle-orm";
import { projects as projectsTable } from "@paperclipai/db";
import type { ProjectOrchestrationPlanInput, ProjectOrchestrationPlanResult } from "@paperclipai/shared";

/**
 * Deterministic project selection for agent orchestration: prefer explicit project id,
 * then case-insensitive unique name match within the company, else recommend creation.
 */
export function projectOrchestrationService(db: Db) {
  return {
    async plan(companyId: string, input: ProjectOrchestrationPlanInput): Promise<ProjectOrchestrationPlanResult> {
      if (input.preferredProjectId) {
        const row = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(and(eq(projectsTable.companyId, companyId), eq(projectsTable.id, input.preferredProjectId)))
          .then((rows) => rows[0] ?? null);
        if (row) {
          return { action: "use_existing", projectId: row.id, matchedBy: "preferred_id" };
        }
      }

      const name = input.suggestedProjectName?.trim() ?? "";
      if (name.length > 0) {
        const matches = await db
          .select({ id: projectsTable.id })
          .from(projectsTable)
          .where(
            and(eq(projectsTable.companyId, companyId), sql`lower(${projectsTable.name}) = ${name.toLowerCase()}`),
          );
        if (matches.length === 1 && matches[0]) {
          return { action: "use_existing", projectId: matches[0].id, matchedBy: "name_ci" };
        }
      }

      const fallbackName =
        name.length > 0
          ? name
          : (input.issueTitle?.trim().slice(0, 120) ?? "New project").trim() || "New project";

      return {
        action: "create_new",
        projectId: null,
        suggestedName: fallbackName,
        matchedBy: "none",
      };
    },
  };
}
