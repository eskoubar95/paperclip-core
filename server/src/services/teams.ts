import { and, asc, eq, inArray } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { teamMemberships, teams } from "@paperclipai/db";
import type { CreateTeam, Team, TeamLeadRefs, TeamMembership, TeamSummary, UpdateTeam } from "@paperclipai/shared";
import { TEAM_MEMBERSHIP_ROLES } from "@paperclipai/shared";
import { notFound, unprocessable } from "../errors.js";

const TEAM_LEAD_ROLE = "team_lead" as (typeof TEAM_MEMBERSHIP_ROLES)[number];

function toTeamRow(row: typeof teams.$inferSelect): Team {
  return {
    id: row.id,
    companyId: row.companyId,
    name: row.name,
    slug: row.slug,
    notes: row.notes,
    reportingHint: row.reportingHint,
    status: row.status as Team["status"],
    notificationPolicy:
      row.notificationPolicy && typeof row.notificationPolicy === "object"
        ? (row.notificationPolicy as Record<string, unknown>)
        : null,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toSummary(row: typeof teams.$inferSelect): TeamSummary {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    status: row.status as TeamSummary["status"],
  };
}

export function teamService(db: Db) {
  return {
    async getById(companyId: string, teamId: string): Promise<Team | null> {
      const row = await db
        .select()
        .from(teams)
        .where(and(eq(teams.id, teamId), eq(teams.companyId, companyId)))
        .then((r) => r[0] ?? null);
      return row ? toTeamRow(row) : null;
    },

    async list(companyId: string, includeArchived = false): Promise<Team[]> {
      const cond = includeArchived
        ? eq(teams.companyId, companyId)
        : and(eq(teams.companyId, companyId), eq(teams.status, "active"));
      const rows = await db
        .select()
        .from(teams)
        .where(cond!)
        .orderBy(asc(teams.name), asc(teams.id));
      return rows.map(toTeamRow);
    },

    async create(companyId: string, input: CreateTeam) {
      const [created] = await db
        .insert(teams)
        .values({
          companyId,
          name: input.name.trim(),
          slug: input.slug.trim().toLowerCase(),
          notes: input.notes ?? null,
          reportingHint: input.reportingHint ?? null,
          status: input.status ?? "active",
          notificationPolicy: input.notificationPolicy ?? null,
        })
        .returning();
      if (!created) throw unprocessable("Failed to create team");
      return toTeamRow(created);
    },

    async update(companyId: string, teamId: string, patch: UpdateTeam) {
      const existing = await this.getById(companyId, teamId);
      if (!existing) throw notFound("Team not found");
      if (Object.keys(patch).length === 0) return existing;
      const next: Partial<typeof teams.$inferInsert> = {};
      if (patch.name !== undefined) next.name = patch.name.trim();
      if (patch.slug !== undefined) next.slug = patch.slug.trim().toLowerCase();
      if (patch.notes !== undefined) next.notes = patch.notes;
      if (patch.reportingHint !== undefined) next.reportingHint = patch.reportingHint;
      if (patch.status !== undefined) next.status = patch.status;
      if (patch.notificationPolicy !== undefined) next.notificationPolicy = patch.notificationPolicy;
      next.updatedAt = new Date();
      const [updated] = await db
        .update(teams)
        .set(next)
        .where(and(eq(teams.id, teamId), eq(teams.companyId, companyId)))
        .returning();
      if (!updated) throw notFound("Team not found");
      return toTeamRow(updated);
    },

    async assertTeamInCompany(companyId: string, teamId: string) {
      const t = await this.getById(companyId, teamId);
      if (!t) throw unprocessable("teamId does not exist for this company");
    },

    async getSummariesByIds(companyId: string, teamIds: string[]): Promise<Map<string, TeamSummary>> {
      const unique = [...new Set(teamIds.filter(Boolean))];
      if (unique.length === 0) return new Map();
      const rows = await db
        .select()
        .from(teams)
        .where(and(eq(teams.companyId, companyId), inArray(teams.id, unique)));
      return new Map(rows.map((r) => [r.id, toSummary(r)]));
    },

    listMemberships(teamId: string, companyId: string) {
      return db
        .select()
        .from(teamMemberships)
        .where(
          and(eq(teamMemberships.teamId, teamId), eq(teamMemberships.companyId, companyId)),
        );
    },

    async addMembership(
      companyId: string,
      teamId: string,
      input: { principalType: string; principalId: string; teamRole: string; status?: string },
    ) {
      await this.assertTeamInCompany(companyId, teamId);
      const status = input.status ?? "active";
      const [row] = await db
        .insert(teamMemberships)
        .values({
          companyId,
          teamId,
          principalType: input.principalType,
          principalId: input.principalId,
          teamRole: input.teamRole,
          status,
        })
        .onConflictDoUpdate({
          target: [
            teamMemberships.teamId,
            teamMemberships.principalType,
            teamMemberships.principalId,
          ],
          set: {
            teamRole: input.teamRole,
            status,
            updatedAt: new Date(),
          },
        })
        .returning();
      if (!row) throw unprocessable("Failed to add team membership");
      return row;
    },

    async removeMembership(companyId: string, teamId: string, membershipId: string) {
      const [removed] = await db
        .delete(teamMemberships)
        .where(
          and(
            eq(teamMemberships.id, membershipId),
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.companyId, companyId),
          ),
        )
        .returning();
      if (!removed) throw notFound("Membership not found");
    },

    /**
     * All active members in a role (for assign-to-role).
     */
    async listMembersInRole(companyId: string, teamId: string, teamRole: string) {
      return db
        .select({
          id: teamMemberships.id,
          principalType: teamMemberships.principalType,
          principalId: teamMemberships.principalId,
          teamRole: teamMemberships.teamRole,
        })
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.companyId, companyId),
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.teamRole, teamRole),
            eq(teamMemberships.status, "active"),
          ),
        );
    },

    /**
     * First assignee for role (deterministic: agent id order).
     */
    async pickAssigneeForWorkstream(
      companyId: string,
      teamId: string,
      workstreamRole: string,
    ): Promise<{ assigneeAgentId: string | null; assigneeUserId: string | null }> {
      const members = await this.listMembersInRole(companyId, teamId, workstreamRole);
      if (members.length === 0) {
        return { assigneeAgentId: null, assigneeUserId: null };
      }
      const first = members.sort((a, b) => a.principalId.localeCompare(b.principalId))[0]!;
      if (first.principalType === "agent") {
        return { assigneeAgentId: first.principalId, assigneeUserId: null };
      }
      if (first.principalType === "user") {
        return { assigneeAgentId: null, assigneeUserId: first.principalId };
      }
      return { assigneeAgentId: null, assigneeUserId: null };
    },

    async getTeamLeadRefs(companyId: string, teamId: string): Promise<TeamLeadRefs> {
      const leads = await db
        .select({ principalType: teamMemberships.principalType, principalId: teamMemberships.principalId })
        .from(teamMemberships)
        .where(
          and(
            eq(teamMemberships.companyId, companyId),
            eq(teamMemberships.teamId, teamId),
            eq(teamMemberships.teamRole, TEAM_LEAD_ROLE),
            eq(teamMemberships.status, "active"),
          ),
        );
      let userId: string | null = null;
      let agentId: string | null = null;
      for (const m of leads) {
        if (m.principalType === "user") userId = m.principalId;
        if (m.principalType === "agent") agentId = m.principalId;
      }
      return { userId, agentId };
    },

    toMembershipRow(row: typeof teamMemberships.$inferSelect): TeamMembership {
      return {
        id: row.id,
        companyId: row.companyId,
        teamId: row.teamId,
        principalType: row.principalType,
        principalId: row.principalId,
        teamRole: row.teamRole as TeamMembership["teamRole"],
        status: row.status,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      };
    },

  };
}
