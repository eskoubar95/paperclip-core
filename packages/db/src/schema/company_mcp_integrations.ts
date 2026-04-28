import { boolean, jsonb, pgTable, text, timestamp, uuid, uniqueIndex, index } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companySecrets } from "./company_secrets.js";

/** Company-scoped MCP server definitions (Cursor mcp.json sources of truth in Paperclip). */
export const companyMcpIntegrations = pgTable(
  "company_mcp_integrations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    /** URL-safe slug unique per company (e.g. notion, railway-prod). */
    key: text("key").notNull(),
    displayName: text("display_name").notNull(),
    /** Template: notion_npx, railway_npx, http_bearer, custom_stdio. */
    providerKey: text("provider_key").notNull(),
    /** Extra: custom command/args/url, env key names, etc. */
    config: jsonb("config").$type<Record<string, unknown>>().notNull().default({}),
    tokenSecretId: uuid("token_secret_id").references(() => companySecrets.id, { onDelete: "set null" }),
    enabled: boolean("enabled").notNull().default(true),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    lastError: text("last_error"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyKeyUq: uniqueIndex("company_mcp_integrations_company_key_uq").on(table.companyId, table.key),
    companyIdx: index("company_mcp_integrations_company_id_idx").on(table.companyId),
  }),
);
