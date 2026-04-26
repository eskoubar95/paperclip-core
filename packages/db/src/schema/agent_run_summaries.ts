import { type AnyPgColumn, pgTable, uuid, text, timestamp, jsonb, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

/**
 * Structured summary of a completed heartbeat run, for cross-adapter / local-server knowledge reuse.
 */
export const agentRunSummaries = pgTable(
  "agent_run_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    heartbeatRunId: uuid("heartbeat_run_id")
      .notNull()
      .unique()
      .references((): AnyPgColumn => heartbeatRuns.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    adapterType: text("adapter_type").notNull(),
    outcome: text("outcome").notNull(),
    summary: text("summary").notNull(),
    metadata: jsonb("metadata").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentCreatedIdx: index("agent_run_summaries_company_agent_created_idx").on(
      table.companyId,
      table.agentId,
      table.createdAt,
    ),
  }),
);
