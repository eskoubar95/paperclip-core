import { and, desc, eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { agentKnowledgeItems, agentRunSummaries } from "@paperclipai/db";
import { summarizeHeartbeatRunResultJson } from "./heartbeat-run-summary.js";
import { parseObject } from "../adapters/utils.js";

const DEFAULT_MAX_CONTEXT_CHARS = 12_000;
const MAX_RUN_SUMMARIES = 6;
const MAX_KNOWLEDGE_ITEMS = 12;

function isSharedKnowledgeEnabled() {
  return process.env.PAPERCLIP_SHARED_KNOWLEDGE !== "0" && process.env.PAPERCLIP_SHARED_KNOWLEDGE !== "false";
}

function maxContextChars() {
  const raw = process.env.PAPERCLIP_SHARED_KNOWLEDGE_MAX_CHARS;
  if (!raw) return DEFAULT_MAX_CONTEXT_CHARS;
  const n = Number.parseInt(raw, 10);
  return Number.isFinite(n) && n > 500 ? Math.min(n, 100_000) : DEFAULT_MAX_CONTEXT_CHARS;
}

function truncate(text: string, max: number) {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

export function sharedKnowledgeService(db: Db) {
  return {
    isEnabled: () => isSharedKnowledgeEnabled(),

    /**
     * Build a markdown block injected into `context.paperclipSharedKnowledge` for local + server adapters.
     */
    async buildContextPackForRun(input: {
      companyId: string;
      agentId: string;
      issueId: string | null;
      projectId: string | null;
    }): Promise<string | null> {
      if (!isSharedKnowledgeEnabled()) return null;

      const { companyId, agentId, issueId: _issueId, projectId: _projectId } = input;
      void _issueId;
      void _projectId;

      const runRows = await db
        .select({
          id: agentRunSummaries.id,
          summary: agentRunSummaries.summary,
          outcome: agentRunSummaries.outcome,
          adapterType: agentRunSummaries.adapterType,
          createdAt: agentRunSummaries.createdAt,
          issueId: agentRunSummaries.issueId,
        })
        .from(agentRunSummaries)
        .where(and(eq(agentRunSummaries.companyId, companyId), eq(agentRunSummaries.agentId, agentId)))
        .orderBy(desc(agentRunSummaries.createdAt))
        .limit(MAX_RUN_SUMMARIES);

      const knowledgeRows = await db
        .select({
          title: agentKnowledgeItems.title,
          body: agentKnowledgeItems.body,
          kind: agentKnowledgeItems.kind,
          sourceRunId: agentKnowledgeItems.sourceRunId,
          createdAt: agentKnowledgeItems.createdAt,
        })
        .from(agentKnowledgeItems)
        .where(and(eq(agentKnowledgeItems.companyId, companyId), eq(agentKnowledgeItems.agentId, agentId)))
        .orderBy(desc(agentKnowledgeItems.createdAt))
        .limit(MAX_KNOWLEDGE_ITEMS);

      if (runRows.length === 0 && knowledgeRows.length === 0) {
        return null;
      }

      const parts: string[] = [
        "## Paperclip shared knowledge (cross-adapter)",
        "",
        "Use this as background from prior successful runs and durable notes. Verify against the codebase before relying on it.",
        "",
      ];

      if (runRows.length > 0) {
        parts.push("### Recent run summaries");
        parts.push("");
        for (const row of runRows) {
          const when = row.createdAt ? new Date(row.createdAt).toISOString() : "";
          parts.push(
            `- **${row.adapterType}** (${row.outcome}${when ? `, ${when}` : ""})${row.issueId ? ` [issue ${row.issueId.slice(0, 8)}…]` : ""}: ${truncate(row.summary.trim(), 900)}`,
          );
        }
        parts.push("");
      }

      if (knowledgeRows.length > 0) {
        parts.push("### Durable knowledge");
        parts.push("");
        for (const row of knowledgeRows) {
          const when = row.createdAt ? new Date(row.createdAt).toISOString() : "";
          parts.push(`- **${row.kind}**${when ? ` (${when})` : ""}: **${row.title.trim()}** — ${truncate(row.body.trim(), 1200)}`);
        }
        parts.push("");
      }

      const joined = parts.join("\n");
      return truncate(joined, maxContextChars());
    },

    /**
     * Persist a summary row after a heartbeat run finishes (idempotent on heartbeatRunId).
     */
    async recordRunSummary(input: {
      companyId: string;
      agentId: string;
      heartbeatRunId: string;
      issueId: string | null;
      projectId: string | null;
      adapterType: string;
      outcome: string;
      resultJson: Record<string, unknown> | null;
      usageJson: Record<string, unknown> | null;
    }) {
      if (!isSharedKnowledgeEnabled()) return;

      const safe = summarizeHeartbeatRunResultJson(input.resultJson);
      const textSummary =
        (typeof safe?.summary === "string" && safe.summary) ||
        (typeof safe?.result === "string" && safe.result) ||
        (typeof input.resultJson?.summary === "string" && input.resultJson.summary) ||
        (typeof input.resultJson?.result === "string" && input.resultJson.result) ||
        "";

      if (!textSummary || textSummary.trim().length < 4) {
        return;
      }

      const metadata: Record<string, unknown> = {
        ...(input.usageJson ?? {}),
        ...(safe && typeof safe === "object" ? safe : {}),
      };

      try {
        await db
          .insert(agentRunSummaries)
          .values({
            companyId: input.companyId,
            agentId: input.agentId,
            heartbeatRunId: input.heartbeatRunId,
            issueId: input.issueId,
            projectId: input.projectId,
            adapterType: input.adapterType,
            outcome: input.outcome,
            summary: truncate(textSummary.trim(), 8000),
            metadata: Object.keys(metadata).length > 0 ? metadata : undefined,
          })
          .onConflictDoNothing({ target: [agentRunSummaries.heartbeatRunId] });
      } catch {
        // Table may not exist on older DBs; avoid failing heartbeats
      }
    },

    async createKnowledgeItem(input: {
      companyId: string;
      agentId: string;
      issueId: string | null;
      projectId: string | null;
      sourceRunId: string | null;
      kind: string;
      title: string;
      body: string;
      confidence: string | null;
      visibility: string;
    }) {
      const now = new Date();
      return db
        .insert(agentKnowledgeItems)
        .values({
          companyId: input.companyId,
          agentId: input.agentId,
          issueId: input.issueId,
          projectId: input.projectId,
          sourceRunId: input.sourceRunId,
          kind: input.kind,
          title: input.title,
          body: input.body,
          confidence: input.confidence ?? undefined,
          visibility: input.visibility,
          createdAt: now,
          updatedAt: now,
        })
        .returning();
    },

    async listRecentSummaries(companyId: string, agentId: string, limit: number) {
      return db
        .select()
        .from(agentRunSummaries)
        .where(and(eq(agentRunSummaries.companyId, companyId), eq(agentRunSummaries.agentId, agentId)))
        .orderBy(desc(agentRunSummaries.createdAt))
        .limit(Math.min(Math.max(limit, 1), 100));
    },

    async listKnowledge(companyId: string, agentId: string, limit: number) {
      return db
        .select()
        .from(agentKnowledgeItems)
        .where(and(eq(agentKnowledgeItems.companyId, companyId), eq(agentKnowledgeItems.agentId, agentId)))
        .orderBy(desc(agentKnowledgeItems.createdAt))
        .limit(Math.min(Math.max(limit, 1), 200));
    },
  };
}

export function readNonEmptyString(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export function parseContextIds(context: Record<string, unknown>) {
  const c = parseObject(context);
  return {
    issueId: readNonEmptyString(c.issueId) ?? readNonEmptyString(c.taskId),
    projectId: readNonEmptyString(c.projectId),
  };
}
