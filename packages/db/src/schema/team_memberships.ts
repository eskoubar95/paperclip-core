import { pgTable, uuid, text, timestamp, index, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { teams } from "./teams.js";

export const teamMemberships = pgTable(
  "team_memberships",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    teamId: uuid("team_id")
      .notNull()
      .references(() => teams.id, { onDelete: "cascade" }),
    principalType: text("principal_type").notNull(),
    principalId: text("principal_id").notNull(),
    teamRole: text("team_role").notNull(),
    status: text("status").notNull().default("active"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    teamPrincipalUq: uniqueIndex("team_memberships_team_principal_uq").on(
      table.teamId,
      table.principalType,
      table.principalId,
    ),
    teamRoleIdx: index("team_memberships_team_role_idx").on(table.teamId, table.teamRole),
    companyIdx: index("team_memberships_company_idx").on(table.companyId),
  }),
);
