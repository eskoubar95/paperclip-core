import { pgTable, uuid, text, timestamp, index, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

/** Outgoing issue event webhooks (V1.2 integration surface). */
export const companyIssueWebhooks = pgTable(
  "company_issue_webhooks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    url: text("url").notNull(),
    secret: text("secret"),
    eventKinds: jsonb("event_kinds")
      .$type<string[]>()
      .notNull()
      .default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("company_issue_webhooks_company_idx").on(table.companyId),
  }),
);
