import { randomUUID } from "node:crypto";
import {
  isolatedTrackingDatabase,
  trackingProject,
} from "@/lib/ai-tracking/stores/fixtures.postgres-test-support";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { WORKER_INTENT_PENDING_PROBE } from "./pending-probe";

function requiredDatabaseUrl() {
  const value = process.env.DATABASE_URL;
  if (!value) throw new Error("DATABASE_URL is required for the PostgreSQL pending-probe test.");
  return value;
}

describe("shipped worker intent pending probe against isolated PostgreSQL", () => {
  let database: Awaited<ReturnType<typeof isolatedTrackingDatabase>>;
  let client: PrismaClient;
  let fixture: Awaited<ReturnType<typeof trackingProject>>;

  beforeAll(async () => {
    const previousUrl = process.env.AI_TRACKING_TEST_DATABASE_URL;
    process.env.AI_TRACKING_TEST_DATABASE_URL = requiredDatabaseUrl();
    try {
      database = await isolatedTrackingDatabase();
      client = database.client;
    } finally {
      if (previousUrl === undefined) delete process.env.AI_TRACKING_TEST_DATABASE_URL;
      else process.env.AI_TRACKING_TEST_DATABASE_URL = previousUrl;
    }
  }, 120_000);

  beforeEach(async () => {
    fixture = await trackingProject(client, `pending-probe-${randomUUID()}`);
  });
  afterEach(async () => {
    if (!fixture) return;
    await client.project.delete({ where: { id: fixture.project.id } });
    await client.user.delete({ where: { id: fixture.project.ownerId } });
  });
  afterAll(async () => {
    if (database) await database.dispose();
  });

  // Fresh schema and search_path isolation let every assertion exercise the complete shipped OR.
  const pendingAnywhere = async () => {
    const [row] = await client.$queryRaw<Array<{ pending: boolean }>>(WORKER_INTENT_PENDING_PROBE);
    return row?.pending ?? false;
  };

  async function unknownSample() {
    const projectId = fixture.project.id;
    const prompt = await client.aiPrompt.create({
      data: { projectId, publicId: makePublicId("aip") },
    });
    const revision = await client.aiPromptRevision.create({
      data: {
        projectId,
        promptId: prompt.id,
        publicId: makePublicId("apr"),
        ordinal: 1,
        text: "Pending probe fixture",
        textHash: "a".repeat(64),
        category: "neutral",
      },
    });
    const run = await client.aiTrackingRun.create({
      data: {
        projectId,
        publicId: makePublicId("air"),
        actorId: fixture.project.ownerId,
        idempotencyKey: randomUUID(),
        payloadHash: "b".repeat(64),
        launchPayload: { fixture: true },
        competitorSnapshot: [],
        state: "running",
      },
    });
    return client.aiTrackingSample.create({
      data: {
        projectId,
        runId: run.id,
        promptRevisionId: revision.id,
        publicId: makePublicId("asm"),
        source: "model_api",
        engine: "chat_gpt",
        configurationHash: "c".repeat(64),
        attemptId: randomUUID(),
        plan: { fixture: true },
        dispatch: "submission_unknown",
      },
    });
  }

  it("wakes for an unclaimed queued rank run and becomes idle after its claim", async () => {
    expect(await pendingAnywhere()).toBe(false);
    const run = await client.rankCheckRun.create({
      data: {
        projectId: fixture.project.id,
        publicId: makePublicId("rcr"),
        orchestrationWorkflowId: `rank-check-run-${randomUUID()}`,
        selectionHash: "pending-probe",
        selectionKind: "single",
        selectionSpec: { fixture: true },
        status: "queued",
        trigger: "manual",
      },
    });
    expect(await pendingAnywhere()).toBe(true);
    await client.rankCheckRun.update({ data: { claimedAt: new Date() }, where: { id: run.id } });
    expect(await pendingAnywhere()).toBe(false);
  });

  it("stays idle for ambiguous AI submissions without a retained provider task", async () => {
    const sample = await unknownSample();
    expect(sample.providerTaskId).toBeNull();
    expect(await pendingAnywhere()).toBe(false);
    await client.aiTrackingRun.update({
      where: { id: sample.runId },
      data: { state: "cancelled" },
    });
    expect(await pendingAnywhere()).toBe(false);
  });

  it("wakes for retained unknown AI tasks, including purchased work after cancellation", async () => {
    const sample = await unknownSample();
    expect(await pendingAnywhere()).toBe(false);
    await client.aiTrackingSample.update({
      where: { id: sample.id },
      data: { providerTaskId: "retained-task" },
    });
    expect(await pendingAnywhere()).toBe(true);
    await client.aiTrackingRun.update({
      where: { id: sample.runId },
      data: { state: "cancelled" },
    });
    expect(await pendingAnywhere()).toBe(true);
    await client.aiTrackingSample.update({
      where: { id: sample.id },
      data: { dispatch: "terminal", measurement: "failed" },
    });
    expect(await pendingAnywhere()).toBe(false);
  });

  it("ignores disabled, future and archived schedules while waking for enabled due intent", async () => {
    const schedule = await client.aiTrackingSchedule.create({
      data: {
        projectId: fixture.project.id,
        publicId: makePublicId("ais"),
        name: "Probe fixture",
        cron: "0 8 * * *",
        timezone: "UTC",
        configuration: { fixture: true },
        enabled: false,
        nextRunAt: new Date(0),
      },
    });
    expect(await pendingAnywhere()).toBe(false);
    await client.aiTrackingSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: null },
    });
    expect(await pendingAnywhere()).toBe(false);
    await client.aiTrackingSchedule.update({ where: { id: schedule.id }, data: { enabled: true } });
    expect(await pendingAnywhere()).toBe(true);
    await client.aiTrackingSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: new Date("2999-01-01T00:00:00Z") },
    });
    expect(await pendingAnywhere()).toBe(false);
    await client.aiTrackingSchedule.update({
      where: { id: schedule.id },
      data: { nextRunAt: new Date(0) },
    });
    expect(await pendingAnywhere()).toBe(true);
    await client.aiTrackingSchedule.update({
      where: { id: schedule.id },
      data: { archivedAt: new Date() },
    });
    expect(await pendingAnywhere()).toBe(false);
  });
});
