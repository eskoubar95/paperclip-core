import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, companyMemberships, createDb } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { accessService } from "../services/access.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping access implicit permission tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("accessService.canUser implicit membership role permissions", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  const userId = "user-op-1";
  let companyId: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-access-implicit-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(companyMemberships);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("grants projects:assign to active operators without explicit rows", async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Implicit Co",
      status: "active",
      issuePrefix: `AC${randomUUID().slice(0, 6).toUpperCase()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(companyMemberships).values({
      id: randomUUID(),
      companyId,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "operator",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const access = accessService(db);
    await expect(access.canUser(companyId, userId, "projects:assign")).resolves.toBe(true);
    await expect(access.canUser(companyId, userId, "projects:create")).resolves.toBe(false);
  });

  it("does not grant project admin keys to viewers without explicit rows", async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Implicit Co 2",
      status: "active",
      issuePrefix: `AC${randomUUID().slice(0, 6).toUpperCase()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await db.insert(companyMemberships).values({
      id: randomUUID(),
      companyId,
      principalType: "user",
      principalId: userId,
      status: "active",
      membershipRole: "viewer",
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const access = accessService(db);
    await expect(access.canUser(companyId, userId, "projects:create")).resolves.toBe(false);
    await expect(access.canUser(companyId, userId, "projects:assign")).resolves.toBe(false);
  });
});
