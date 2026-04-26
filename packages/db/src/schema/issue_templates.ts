import { pgTable, uuid, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { projects } from "./projects.js";
import { teams } from "./teams.js";

export const issueTemplates = pgTable(
  "issue_templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    description: text("description"),
    defaultTeamId: uuid("default_team_id").references(() => teams.id, { onDelete: "set null" }),
    defaultWorkstreamRole: text("default_workstream_role"),
    defaultStatus: text("default_status"),
    defaultPriority: text("default_priority"),
    bodyTemplate: text("body_template"),
    subIssueBlueprints: jsonb("sub_issue_blueprints").$type<unknown[] | null>().default(null),
    defaultLabelIds: jsonb("default_label_ids").$type<string[] | null>().default(null),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("issue_templates_company_idx").on(table.companyId),
  }),
);
