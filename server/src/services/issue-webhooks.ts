import { createHmac } from "node:crypto";
import { and, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyIssueWebhooks } from "@paperclipai/db";
import type { CompanyIssueWebhook, CreateCompanyIssueWebhook } from "@paperclipai/shared";
import { notFound } from "../errors.js";
import { logger } from "../middleware/logger.js";

function toRow(row: typeof companyIssueWebhooks.$inferSelect): CompanyIssueWebhook {
  return {
    id: row.id,
    companyId: row.companyId,
    url: row.url,
    secret: row.secret,
    eventKinds: (row.eventKinds as string[]) ?? [],
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export function companyIssueWebhookService(db: Db) {
  return {
    list(companyId: string) {
      return db
        .select()
        .from(companyIssueWebhooks)
        .where(eq(companyIssueWebhooks.companyId, companyId))
        .then((rows) => rows.map(toRow));
    },

    async create(companyId: string, input: CreateCompanyIssueWebhook) {
      const [row] = await db
        .insert(companyIssueWebhooks)
        .values({
          companyId,
          url: input.url,
          secret: input.secret ?? null,
          eventKinds: input.eventKinds,
        })
        .returning();
      if (!row) throw new Error("Failed to create webhook");
      return toRow(row);
    },

    async remove(companyId: string, id: string) {
      const [removed] = await db
        .delete(companyIssueWebhooks)
        .where(and(eq(companyIssueWebhooks.companyId, companyId), eq(companyIssueWebhooks.id, id)))
        .returning();
      if (!removed) throw notFound("Webhook not found");
    },
  };
}

export async function deliverIssueWebhooks(input: {
  db: Db;
  companyId: string;
  eventKind: string;
  payload: Record<string, unknown>;
}) {
  const { db, companyId, eventKind, payload } = input;
  const hooks = await db
    .select()
    .from(companyIssueWebhooks)
    .where(eq(companyIssueWebhooks.companyId, companyId));
  for (const h of hooks) {
    const kinds = (h.eventKinds as string[]) ?? [];
    if (kinds.length > 0 && !kinds.includes(eventKind) && !kinds.includes("*")) continue;
    const body = JSON.stringify({ event: eventKind, payload, sentAt: new Date().toISOString() });
    const headers: Record<string, string> = { "content-type": "application/json" };
    if (h.secret) {
      const sig = createHmac("sha256", h.secret).update(body).digest("hex");
      headers["x-paperclip-signature"] = `sha256=${sig}`;
    }
    try {
      await fetch(h.url, { method: "POST", headers, body });
    } catch (err) {
      logger.warn({ err, webhookId: h.id, companyId }, "issue webhook delivery failed");
    }
  }
}
