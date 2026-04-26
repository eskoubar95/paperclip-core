import { index, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** Long-lived tokens for local Paperclip MCP sync (hashed at rest; shown once on create). */
export const companyMcpSyncTokens = pgTable(
  "company_mcp_sync_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => ({
    tokenHashUq: uniqueIndex("company_mcp_sync_tokens_token_hash_uq").on(table.tokenHash),
    companyIdx: index("company_mcp_sync_tokens_company_id_idx").on(table.companyId),
  }),
);
