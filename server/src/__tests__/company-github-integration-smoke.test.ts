import { describe, expect, it } from "vitest";
import { fetchGithubUserRepos } from "../services/company-github.js";

/**
 * Optional end-to-end check against api.github.com.
 * Run: `PAPERCLIP_GITHUB_SMOKE_PAT=ghp_... pnpm test:run` (from repo root, with deps installed).
 */
describe.skipIf(!process.env.PAPERCLIP_GITHUB_SMOKE_PAT)("company GitHub API smoke (PAPERCLIP_GITHUB_SMOKE_PAT)", () => {
  it("lists at least one repo for the token", async () => {
    const pat = process.env.PAPERCLIP_GITHUB_SMOKE_PAT!;
    const repos = await fetchGithubUserRepos(pat);
    expect(repos.length).toBeGreaterThan(0);
  });
});
