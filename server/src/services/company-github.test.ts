import { describe, expect, it } from "vitest";
import { tryParseGithubRepoFullName } from "./company-github.js";

describe("tryParseGithubRepoFullName", () => {
  it("parses https github.com URLs to owner/name", () => {
    expect(tryParseGithubRepoFullName("https://github.com/Acme/Widget.git")).toBe("acme/widget");
    expect(tryParseGithubRepoFullName("https://github.com/acme/widget")).toBe("acme/widget");
  });

  it("accepts host-only form without scheme", () => {
    expect(tryParseGithubRepoFullName("github.com/foo/bar")).toBe("foo/bar");
  });

  it("returns null for non-GitHub hosts", () => {
    expect(tryParseGithubRepoFullName("https://gitlab.com/a/b")).toBeNull();
  });
});
