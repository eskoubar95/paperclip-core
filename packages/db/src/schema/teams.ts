import { pgTable, uuid, text, timestamp, index, uniqueIndex, jsonb } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";

export const teams = pgTable(
  "teams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    companyId: uuid("company_id")
      .notNull()
      .references(() => companies.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    notes: text("notes"),
    /** Human-facing “reporting” hint (e.g. program / batch). */
    reportingHint: text("reporting_hint"),
    status: text("status").notNull().default("active"),
    /** e.g. notify team_lead on status transitions */
    notificationPolicy: jsonb("notification_policy").$type<Record<string, unknown> | null>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    companyIdx: index("teams_company_idx").on(table.companyId),
    companySlugUq: uniqueIndex("teams_company_slug_uq").on(table.companyId, table.slug),
  }),
);
