import { type AnyPgColumn, pgTable, uuid, text, timestamp, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { agents } from "./agents.js";
import { projects } from "./projects.js";
import { issues } from "./issues.js";
import { heartbeatRuns } from "./heartbeat_runs.js";

/**
 * Durable knowledge entries (facts, decisions) promoted from runs or created via API.
 */
export const agentKnowledgeItems = pgTable(
  "agent_knowledge_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    issueId: uuid("issue_id").references(() => issues.id, { onDelete: "set null" }),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    sourceRunId: uuid("source_run_id").references((): AnyPgColumn => heartbeatRuns.id, { onDelete: "set null" }),
    kind: text("kind").notNull().default("note"),
    title: text("title").notNull(),
    body: text("body").notNull(),
    confidence: text("confidence"),
    visibility: text("visibility").notNull().default("agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyAgentCreatedIdx: index("agent_knowledge_items_company_agent_created_idx").on(
      table.companyId,
      table.agentId,
      table.createdAt,
    ),
  }),
);
