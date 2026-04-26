import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { companies, createDb, projects } from "@paperclipai/db";
import {
  getEmbeddedPostgresTestSupport,
  startEmbeddedPostgresTestDatabase,
} from "./helpers/embedded-postgres.js";
import { projectOrchestrationService } from "../services/project-orchestration.js";

const embeddedPostgresSupport = await getEmbeddedPostgresTestSupport();
const describeEmbeddedPostgres = embeddedPostgresSupport.supported ? describe : describe.skip;

if (!embeddedPostgresSupport.supported) {
  console.warn(
    `Skipping project orchestration tests: ${embeddedPostgresSupport.reason ?? "unsupported environment"}`,
  );
}

describeEmbeddedPostgres("projectOrchestrationService", () => {
  let db!: ReturnType<typeof createDb>;
  let tempDb: Awaited<ReturnType<typeof startEmbeddedPostgresTestDatabase>> | null = null;
  let companyId: string;

  beforeAll(async () => {
    tempDb = await startEmbeddedPostgresTestDatabase("paperclip-project-orch-");
    db = createDb(tempDb.connectionString);
  }, 20_000);

  afterEach(async () => {
    await db.delete(projects);
    await db.delete(companies);
  });

  afterAll(async () => {
    await tempDb?.cleanup();
  });

  it("returns preferred project when id matches", async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Orchestration Co",
      status: "active",
      issuePrefix: `OR${randomUUID().slice(0, 6).toUpperCase()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const projectId = randomUUID();
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Alpha",
      status: "backlog",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = projectOrchestrationService(db);
    const plan = await svc.plan(companyId, { preferredProjectId: projectId });
    expect(plan).toEqual({
      action: "use_existing",
      projectId,
      matchedBy: "preferred_id",
    });
  });

  it("matches project by case-insensitive name when unique", async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Orchestration Co 2",
      status: "active",
      issuePrefix: `OR${randomUUID().slice(0, 6).toUpperCase()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const projectId = randomUUID();
    await db.insert(projects).values({
      id: projectId,
      companyId,
      name: "Beta Stream",
      status: "backlog",
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = projectOrchestrationService(db);
    const plan = await svc.plan(companyId, { suggestedProjectName: "beta stream" });
    expect(plan).toMatchObject({
      action: "use_existing",
      projectId,
      matchedBy: "name_ci",
    });
  });

  it("recommends create when no match", async () => {
    companyId = randomUUID();
    await db.insert(companies).values({
      id: companyId,
      name: "Orchestration Co 3",
      status: "active",
      issuePrefix: `OR${randomUUID().slice(0, 6).toUpperCase()}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const svc = projectOrchestrationService(db);
    const plan = await svc.plan(companyId, { issueTitle: "Fix the thing" });
    expect(plan).toMatchObject({
      action: "create_new",
      projectId: null,
      matchedBy: "none",
    });
    expect((plan as { suggestedName: string }).suggestedName).toContain("Fix");
  });
});
