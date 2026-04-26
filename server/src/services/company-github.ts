import { eq } from "drizzle-orm";
import type { Db } from "@paperclipai/db";
import { companyGithubIntegrations } from "@paperclipai/db";
import { unprocessable } from "../errors.js";
import type { secretService } from "./secrets.js";

export const PAPERCLIP_GITHUB_PAT_SECRET_NAME = "paperclip_github_pat";

type SecretsSvc = ReturnType<typeof secretService>;

export function tryParseGithubRepoFullName(repoUrl: string): string | null {
  const raw = repoUrl.trim();
  if (!raw) return null;
  try {
    const u = new URL(raw.includes("://") ? raw : `https://${raw}`);
    if (u.hostname !== "github.com") return null;
    const parts = u.pathname.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);
    if (parts.length < 2) return null;
    const [owner, repo] = parts;
    const name = repo.replace(/\.git$/i, "");
    return `${owner}/${name}`.toLowerCase();
  } catch {
    return null;
  }
}

export async function assertWorkspaceRepoUrlAllowedForCompany(
  db: Db,
  companyId: string,
  repoUrl: string | null | undefined,
) {
  if (!readNonEmpty(repoUrl)) return;
  const full = tryParseGithubRepoFullName(repoUrl!);
  if (!full) return;
  const row = await db
    .select()
    .from(companyGithubIntegrations)
    .where(eq(companyGithubIntegrations.companyId, companyId))
    .then((rows) => rows[0] ?? null);
  const allowed = row?.allowedRepoFullNames ?? [];
  if (allowed.length === 0) return;
  const set = new Set(allowed.map((s) => s.toLowerCase()));
  if (!set.has(full)) {
    throw unprocessable(
      `GitHub repository "${full}" is not in this company's allowed list. Update Company → GitHub settings.`,
    );
  }
}

function readNonEmpty(value: string | null | undefined): string | null {
  if (typeof value !== "string") return null;
  const t = value.trim();
  return t.length > 0 ? t : null;
}

export type GithubRepoListItem = {
  fullName: string;
  htmlUrl: string;
  private: boolean;
  defaultBranch: string | null;
};

export async function fetchGithubUserRepos(pat: string): Promise<GithubRepoListItem[]> {
  const headers = {
    Authorization: `Bearer ${pat}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
  };
  const out: GithubRepoListItem[] = [];
  let page = 1;
  const perPage = 100;
  for (;;) {
    const url = `https://api.github.com/user/repos?per_page=${perPage}&page=${page}&sort=full_name&affiliation=owner,collaborator,organization_member`;
    const res = await fetch(url, { headers });
    if (!res.ok) {
      const text = await res.text().catch(() => "");
      throw unprocessable(
        `GitHub API error (${res.status}): ${text.slice(0, 500) || res.statusText}. Check token scope and expiration.`,
      );
    }
    const data = (await res.json()) as unknown;
    if (!Array.isArray(data) || data.length === 0) break;
    for (const item of data) {
      if (!item || typeof item !== "object") continue;
      const rec = item as Record<string, unknown>;
      const fullName = typeof rec.full_name === "string" ? rec.full_name : null;
      const htmlUrl = typeof rec.html_url === "string" ? rec.html_url : null;
      if (!fullName || !htmlUrl) continue;
      out.push({
        fullName: fullName.toLowerCase(),
        htmlUrl,
        private: Boolean(rec.private),
        defaultBranch: typeof rec.default_branch === "string" ? rec.default_branch : null,
      });
    }
    if (data.length < perPage) break;
    page += 1;
    if (page > 50) break;
  }
  return out;
}

/** Unresolved env bindings (secret_ref) merged inside `secretService.resolveAdapterConfigForRuntime` before unwrap. */
export async function getCompanyGithubEnvBindingsForRuntime(
  db: Db,
  companyId: string,
): Promise<Record<string, { type: "secret_ref"; secretId: string; version: "latest" }>> {
  const row = await db
    .select()
    .from(companyGithubIntegrations)
    .where(eq(companyGithubIntegrations.companyId, companyId))
    .then((rows) => rows[0] ?? null);
  if (!row?.patSecretId) return {};
  const ref = { type: "secret_ref" as const, secretId: row.patSecretId, version: "latest" as const };
  return { GH_TOKEN: ref, GITHUB_TOKEN: ref };
}

export function companyGithubService(db: Db, secretsSvc: SecretsSvc) {
  async function getIntegration(companyId: string) {
    return db
      .select()
      .from(companyGithubIntegrations)
      .where(eq(companyGithubIntegrations.companyId, companyId))
      .then((rows) => rows[0] ?? null);
  }

  async function upsertIntegration(
    companyId: string,
    input: { pat?: string | null; allowedRepoFullNames: string[] },
    actor: { userId?: string | null; agentId?: string | null },
  ) {
    const normalizedAllowed = Array.from(
      new Set(
        input.allowedRepoFullNames
          .map((s) => s.trim().toLowerCase())
          .filter((s) => s.includes("/") && s.length > 2),
      ),
    );

    let patSecretId: string | null = null;
    const pat = readNonEmpty(input.pat ?? undefined);
    const prior = await getIntegration(companyId);
    if (pat) {
      const existingSecret = await secretsSvc.getByName(companyId, PAPERCLIP_GITHUB_PAT_SECRET_NAME);
      if (existingSecret) {
        await secretsSvc.rotate(existingSecret.id, { value: pat }, actor);
        patSecretId = existingSecret.id;
      } else {
        const created = await secretsSvc.create(
          companyId,
          {
            name: PAPERCLIP_GITHUB_PAT_SECRET_NAME,
            provider: "local_encrypted",
            value: pat,
            description: "GitHub PAT for company integration (managed from Company → GitHub)",
          },
          actor,
        );
        patSecretId = created.id;
      }
    } else {
      patSecretId = prior?.patSecretId ?? null;
      if (!patSecretId) {
        throw unprocessable(
          "GitHub PAT is required on first setup. Paste a token, or save allowlist only after a PAT is already configured.",
        );
      }
    }

    if (prior) {
      await db
        .update(companyGithubIntegrations)
        .set({
          provider: "github_pat",
          patSecretId,
          allowedRepoFullNames: normalizedAllowed,
          updatedAt: new Date(),
        })
        .where(eq(companyGithubIntegrations.companyId, companyId));
    } else {
      await db.insert(companyGithubIntegrations).values({
        companyId,
        provider: "github_pat",
        patSecretId,
        allowedRepoFullNames: normalizedAllowed,
      });
    }

    return getIntegration(companyId);
  }

  return {
    getIntegration,
    upsertIntegration,
    async listReposFromGithub(companyId: string): Promise<GithubRepoListItem[]> {
      const row = await getIntegration(companyId);
      if (!row?.patSecretId) {
        throw unprocessable("Save a GitHub PAT in Company → GitHub before listing repositories.");
      }
      const pat = await secretsSvc.resolveSecretValue(companyId, row.patSecretId, "latest");
      return fetchGithubUserRepos(pat);
    },
  };
}
