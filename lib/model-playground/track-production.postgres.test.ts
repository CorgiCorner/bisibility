import { isPublicIdOfType, makePublicId } from "@/lib/db/public-id-resources";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { preview, result } from "./contract-fixtures.test-support";
import { reportProductionDatabase } from "./production.postgres.test-support";
import { createModelPlaygroundStore } from "./store";
import type { ModelPlaygroundDatabase } from "./store-db";

const shared = vi.hoisted(() => ({ db: null as PrismaClient | null }));
vi.mock("@/lib/db/prisma", () => ({
  get prisma() {
    return shared.db;
  },
}));

import { saveModelPlaygroundReport } from "./report";
import { trackModelPlaygroundWithPromptStore } from "./track-prompt-store";

// Production models plus the exact playground migrations, in a disposable non-public schema.
// Other SQL-owned triggers/generated columns and external queues are outside this fixture.
describe.skipIf(!process.env.AI_TRACKING_TEST_DATABASE_URL)("production prompt handoff", () => {
  let fixture: Awaited<ReturnType<typeof reportProductionDatabase>>;
  let db: PrismaClient;
  let database: ModelPlaygroundDatabase;
  let project: { id: string; ownerId: string };
  let run: Awaited<ReturnType<ReturnType<typeof createModelPlaygroundStore>["launch"]>>;
  beforeAll(async () => {
    fixture = await reportProductionDatabase();
    db = fixture.client;
    shared.db = db;
    database = { $transaction: (work) => db.$transaction((tx) => work(tx), { timeout: 15000 }) };
    const owner = await db.user.create({
      data: {
        publicId: makePublicId("usr"),
        email: `${crypto.randomUUID()}@fixture.invalid`,
        name: "Fixture",
      },
    });
    project = await db.project.create({
      data: { publicId: makePublicId("prj"), name: "Fixture", ownerId: owner.id },
    });
    const connectionPublicId = makePublicId("conn");
    if (!isPublicIdOfType(connectionPublicId, "conn"))
      throw new Error("Invalid fixture connection");
    await db.providerConnection.create({
      data: {
        projectId: project.id,
        publicId: connectionPublicId,
        provider: "openrouter",
        kind: "model",
        credentialSource: "own",
        status: "connected",
      },
    });
    const snapshot = preview();
    snapshot.previewId = crypto.randomUUID();
    snapshot.projectId = project.id;
    snapshot.createdAt = new Date().toISOString();
    snapshot.expiresAt = new Date(Date.now() + 300000).toISOString();
    snapshot.input.columns[0].connectionId = connectionPublicId;
    const store = createModelPlaygroundStore(database);
    await store.savePreview(snapshot, project.ownerId);
    run = await store.launch({
      version: 1,
      projectId: project.id,
      actorId: project.ownerId,
      requestId: crypto.randomUUID(),
      previewId: snapshot.previewId,
      configHash: snapshot.configHash,
    });
    const lease = await store.claim({
      projectId: project.id,
      runId: run.id,
      columnId: run.columns[0].columnId,
      leaseSeconds: 300,
    });
    if (!lease?.leaseToken) throw new Error("Expected lease");
    const identity = {
      projectId: project.id,
      runId: run.id,
      columnId: lease.columnId,
      leaseToken: lease.leaseToken,
    };
    await store.fenceDispatch(identity);
    await store.complete(identity, { ...result(), column: snapshot.input.columns[0] });
    // Isolated production-model setup only; no request timeout is changed.
  }, 120000);
  afterAll(async () => {
    if (fixture) await fixture.dispose();
  });

  const quietTables = [
    "ai_tracking_schedules",
    "ai_tracking_runs",
    "ai_tracking_samples",
    "check_schedules",
    "rank_check_runs",
    "rank_checks",
    "metering_event",
    "metering_request_count",
    "metering_budget_usage",
  ] as const;
  async function quietState() {
    return Object.fromEntries(
      await Promise.all(
        quietTables.map(async (table) => [
          table,
          await db.$queryRawUnsafe(`SELECT * FROM ${table}`),
        ]),
      ),
    );
  }
  it("rolls the real prompt store back with its preset, then saves paused with no scheduling, execution or paid quota changes", async () => {
    const input = { projectId: project.id, runId: run.id, topicId: null };
    const before = await quietState();
    await db.$executeRawUnsafe(
      `CREATE FUNCTION reject_preset() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'synthetic failure'; END $$`,
    );
    await db.$executeRawUnsafe(
      `CREATE TRIGGER reject_preset BEFORE INSERT ON model_playground_presets FOR EACH ROW EXECUTE FUNCTION reject_preset()`,
    );
    expect(await trackModelPlaygroundWithPromptStore(database, input)).toEqual({
      ok: false,
      reason: "storage",
    });
    expect(await db.aiPrompt.count()).toBe(0);
    expect(await db.aiPromptRevision.count()).toBe(0);
    await db.$executeRawUnsafe(`DROP TRIGGER reject_preset ON model_playground_presets`);
    const saved = await trackModelPlaygroundWithPromptStore(database, input);
    expect(saved.ok).toBe(true);
    const prompt = await db.aiPrompt.findFirstOrThrow({
      where: { projectId: project.id },
      include: { revisions: true },
    });
    expect(prompt.pausedAt).not.toBeNull();
    expect(prompt.revisions[0].text).toBe(run.snapshot.input.prompt);
    expect(await db.aiPrompt.count({ where: { projectId: project.id, pausedAt: null } })).toBe(0);
    expect(await db.modelPlaygroundPreset.findFirst()).toMatchObject({
      promptId: prompt.id,
      mode: "manual",
      scheduleEnabled: false,
      config: run.snapshot.input,
    });
    expect(await quietState()).toEqual(before);
    // Positive control proves this assertion watches the production scheduling table.
    const schedule = await db.aiTrackingSchedule.create({
      data: {
        projectId: project.id,
        publicId: makePublicId("ais"),
        name: "Control",
        cron: "0 9 * * *",
        timezone: "UTC",
        configuration: {},
        enabled: false,
      },
    });
    expect(await quietState()).not.toEqual(before);
    await db.aiTrackingSchedule.delete({ where: { id: schedule.id } });
    expect(await quietState()).toEqual(before);
  });
  it("serializes real overlapping saves and keeps report deletion dismissed", async () => {
    let unlock!: () => void;
    let locked!: () => void;
    const held = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const release = new Promise<void>((resolve) => {
      unlock = resolve;
    });
    const blocker = db.$transaction(
      async (tx) => {
        await tx.$queryRawUnsafe(
          `SELECT id FROM model_playground_runs WHERE id=$1 FOR UPDATE`,
          run.id,
        );
        locked();
        await release;
      },
      { timeout: 15000 },
    );
    await held;
    let finished = 0;
    const save = () =>
      saveModelPlaygroundReport(database, { projectId: project.id, runId: run.id }, []).then(
        (value) => {
          finished++;
          return value;
        },
      );
    const pending = [save(), save()];
    try {
      await vi.waitFor(async () => {
        const rows = await db.$queryRawUnsafe<{ count: number }[]>(
          `SELECT COUNT(*)::int AS count FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%model_playground_runs%'`,
        );
        expect(rows[0].count).toBeGreaterThanOrEqual(2);
      });
      expect(finished).toBe(0);
    } finally {
      unlock();
      await blocker;
    }
    const responses = await Promise.all(pending);
    expect(responses.every((value) => value.ok)).toBe(true);
    if (!responses[0].ok || !responses[1].ok) throw new Error("Expected saved reports");
    expect(responses[0].reportId).toBe(responses[1].reportId);
    expect(responses.map((value) => (value.ok ? value.alreadySaved : null)).sort()).toEqual([
      false,
      true,
    ]);
    const report = await db.agentReport.findFirstOrThrow({
      where: { publicId: responses[0].reportId },
    });
    await db.agentReport.delete({ where: { id: report.id } });
    expect(
      (await db.modelPlaygroundRun.findUniqueOrThrow({ where: { id: run.id } })).reportId,
    ).toBeNull();
    expect(
      await saveModelPlaygroundReport(database, { projectId: project.id, runId: run.id }, []),
    ).toEqual({ ok: false, reason: "dismissed" });
    expect(await db.agentReport.count({ where: { projectId: project.id } })).toBe(0);
  });
});
