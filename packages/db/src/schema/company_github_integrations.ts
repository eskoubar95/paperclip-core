import { jsonb, pgTable, text, timestamp, uuid, uniqueIndex } from "drizzle-orm/pg-core";
import { companies } from "./companies.js";
import { companySecrets } from "./company_secrets.js";

/**
 * One row per company: GitHub PAT integration (fine-grained or classic) + allowlisted repos.
 * PAT material lives in company_secrets; this table stores metadata only.
 */
export const companyGithubIntegrations = pgTable(
  "company_github_integrations",
  {
    companyId: uuid("company_id")
      .primaryKey()
      .references(() => companies.id, { onDelete: "cascade" }),
    provider: text("provider").notNull().default("github_pat"),
    /** FK to company_secrets row holding the PAT */
    patSecretId: uuid("pat_secret_id").references(() => companySecrets.id, { onDelete: "set null" }),
    /** Allowed GitHub repos as `owner/name` (lowercase), JSON array of strings */
    allowedRepoFullNames: jsonb("allowed_repo_full_names").$type<string[]>().notNull().default([]),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => ({
    patSecretUq: uniqueIndex("company_github_integrations_pat_secret_uq").on(table.patSecretId),
  }),
);
