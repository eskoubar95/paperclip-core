import { pgTable, text, timestamp, uuid, primaryKey } from "drizzle-orm/pg-core";
import { agents } from "./agents.js";
import { companyMcpIntegrations } from "./company_mcp_integrations.js";

/** Which MCP integrations an agent may use; Option A policy (Option B may enforce at run). */
export const agentMcpBindings = pgTable(
  "agent_mcp_bindings",
  {
    agentId: uuid("agent_id")
      .notNull()
      .references(() => agents.id, { onDelete: "cascade" }),
    mcpIntegrationId: uuid("mcp_integration_id")
      .notNull()
      .references(() => companyMcpIntegrations.id, { onDelete: "cascade" }),
    permission: text("permission").notNull().default("read"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    pk: primaryKey({ columns: [table.agentId, table.mcpIntegrationId] }),
  }),
);
