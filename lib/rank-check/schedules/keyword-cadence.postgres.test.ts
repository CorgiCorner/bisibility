import { randomUUID } from "node:crypto";
import { normalizeSchedule } from "@/lib/actions/_schedule";
import { createKeywordBatchSet } from "@/lib/actions/keyword-batch";
import { assignCreatedKeywordCadences } from "@/lib/api/keyword-create-cadence";
import { keywordInclude, keywordResource } from "@/lib/api/resources";
import { makePublicId } from "@/lib/db/public-id";
import { type Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { setKeywordCadence } from "./keyword-cadence";
import { removeKeywordsFromSchedule } from "./service-membership";

const store = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, key) => {
        const value = store.db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(store.db) : value;
      },
    },
  ),
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn() }));
const url = process.env.PROVIDER_UI_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (
  !url ||
  new URL(url).hostname !== "127.0.0.1" ||
  !["/credits_fixture", "/cadence_fixture"].includes(new URL(url).pathname)
) {
  throw new Error("An owned loopback credits_fixture or cadence_fixture database is required.");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 8 }) });
let userId: string;
let projectId: string;
let locationId: string;
let keywordId: string;
let projectPublicId: string;
const daily = () =>
  normalizeSchedule({
    frequency: "daily",
    cronExpression: null,
    jitterMinutes: 60,
    timezone: "UTC",
  });
const apply = (ids: string[], cadence = daily()) =>
  db.$transaction((tx) => setKeywordCadence(tx, projectId, ids, cadence, userId), {
    timeout: 30_000,
  });
async function keyword(text: string, project = projectId) {
  return db.keyword.create({
    data: {
      publicId: makePublicId("kw"),
      projectId: project,
      text,
      locationId,
      location: "United States",
    },
  });
}
async function resource(id = keywordId) {
  const row = await db.keyword.findUniqueOrThrow({ include: keywordInclude, where: { id } });
  return keywordResource(row, projectPublicId);
}
beforeEach(async () => {
  store.db = db;
  userId = randomUUID();
  projectId = randomUUID();
  projectPublicId = makePublicId("prj");
  locationId = randomUUID();
  await db.user.create({
    data: {
      id: userId,
      publicId: makePublicId("usr"),
      email: `${userId}@example.test`,
      name: "Cadence fixture",
    },
  });
  await db.project.create({
    data: {
      id: projectId,
      publicId: projectPublicId,
      ownerId: userId,
      name: "Cadence fixture",
      domain: "example.test",
    },
  });
  await db.location.create({
    data: {
      id: locationId,
      kind: "country",
      displayName: "United States",
      countryCode: "US",
      gl: "us",
      hl: "en",
      languageCode: "en",
      languageLabel: "English",
      primaryGeoName: "United States",
      secondaryGeoName: "",
      canonicalKey: randomUUID(),
    },
  });
  keywordId = (await keyword("first")).id;
});
afterEach(async () => {
  await db.project.deleteMany({ where: { ownerId: userId } });
  await db.location.delete({ where: { id: locationId } });
  await db.user.delete({ where: { id: userId } });
});
afterAll(() => db.$disconnect());

describe("explicit keyword cadence membership", () => {
  it("does not inherit an available default or stale legacy Daily row", async () => {
    await db.projectDefaults.create({ data: { projectId, frequency: "daily" } });
    await db.checkSchedule.create({
      data: {
        projectId,
        publicId: makePublicId("sch"),
        name: "Default",
        frequency: "daily",
        isDefault: true,
      },
    });
    await db.keywordSchedule.create({
      data: { keywordId, frequency: "daily", timezone: "UTC", nextCheckAt: new Date() },
    });
    expect((await resource()).schedule).toMatchObject({ frequency: "manual", next_check_at: null });
  });

  it("persists omitted create cadence as Manual even for the legacy scheduler", async () => {
    await db.projectDefaults.create({ data: { projectId, frequency: "daily" } });
    const result = await db.$transaction((tx) =>
      createKeywordBatchSet(tx, projectId, [
        {
          device: "desktop",
          keyword: "created manual",
          location: "United States",
          locationId,
          schedule: null,
          tags: [],
        },
      ]),
    );
    const id = result.created[0].id;
    expect(await db.keywordSchedule.findUnique({ where: { keywordId: id } })).toMatchObject({
      frequency: "manual",
      nextCheckAt: null,
    });
    expect((await resource(id)).schedule).toMatchObject({
      frequency: "manual",
      next_check_at: null,
    });
  });
  it("serializes concurrent explicit Daily additions onto one matching project schedule", async () => {
    const second = await keyword("second");
    await Promise.all([apply([keywordId]), apply([second.id])]);
    const rows = await db.keyword.findMany({
      where: { projectId },
      include: { checkSchedule: true, schedule: true },
    });
    expect(new Set(rows.map((row) => row.checkScheduleId)).size).toBe(1);
    expect(
      rows.every(
        (row) => row.checkSchedule?.frequency === "daily" && row.schedule?.frequency === "daily",
      ),
    ).toBe(true);
    expect(await db.checkSchedule.count({ where: { projectId } })).toBe(1);
    expect((await resource()).schedule).toMatchObject({
      frequency: "daily",
      source: "keyword",
      next_check_at: expect.any(String),
    });
    const audits = await db.auditLog.findMany({ where: { projectId } });
    expect(audits.some((row) => row.action === "check_schedule.create")).toBe(true);
    expect(JSON.stringify(audits.map((row) => row.after))).not.toContain(keywordId);
  });

  it("reuses an exact schedule without changing its name, default flag or other members", async () => {
    const existing = await db.checkSchedule.create({
      data: {
        projectId,
        publicId: makePublicId("sch"),
        name: "Chosen daily",
        frequency: "daily",
        timezone: "UTC",
        jitterMinutes: 60,
        isDefault: true,
      },
    });
    await apply([keywordId]);
    expect((await db.keyword.findUniqueOrThrow({ where: { id: keywordId } })).checkScheduleId).toBe(
      existing.id,
    );
    expect(await db.checkSchedule.findUnique({ where: { id: existing.id } })).toMatchObject({
      name: "Chosen daily",
      isDefault: true,
    });
  });

  it("does not silently adopt another cadence's provider or fixed time", async () => {
    await db.checkSchedule.create({
      data: {
        projectId,
        publicId: makePublicId("sch"),
        name: "Timed daily",
        frequency: "daily",
        timezone: "UTC",
        jitterMinutes: 60,
        timeOfDay: "09:00",
        providerPolicy: "serpapi",
      },
    });
    await apply([keywordId]);
    const row = await db.keyword.findUniqueOrThrow({
      where: { id: keywordId },
      include: { checkSchedule: true },
    });
    expect(row.checkSchedule).toMatchObject({
      timeOfDay: null,
      providerPolicy: null,
      isDefault: false,
    });
    expect(await db.checkSchedule.count({ where: { projectId } })).toBe(2);
  });

  it("Manual detaches membership and removes an empty future occurrence", async () => {
    await apply([keywordId]);
    const row = await db.keyword.findUniqueOrThrow({ where: { id: keywordId } });
    await db.rankCheckRun.create({
      data: {
        publicId: makePublicId("rcr"),
        projectId,
        checkScheduleId: row.checkScheduleId,
        trigger: "scheduled",
        selectionKind: "scheduled_due",
        selectionHash: "fixture-selection",
        status: "planned",
        plannedFor: new Date("2099-01-01"),
        selectionSpec: { occurrenceKey: "2099-01-01" },
      },
    });
    await apply(
      [keywordId],
      normalizeSchedule({
        frequency: "manual",
        cronExpression: null,
        jitterMinutes: 0,
        timezone: "UTC",
      }),
    );
    expect((await resource()).schedule).toMatchObject({ frequency: "manual", next_check_at: null });
    expect(
      (await db.keyword.findUniqueOrThrow({ where: { id: keywordId } })).checkScheduleId,
    ).toBeNull();
    expect(await db.rankCheckRun.count({ where: { projectId } })).toBe(0);
    expect(await db.checkSchedule.count({ where: { projectId } })).toBe(1);
  });

  it("Paused does not pause the shared schedule or another keyword", async () => {
    const peer = await keyword("peer");
    await apply([keywordId, peer.id]);
    await apply(
      [keywordId],
      normalizeSchedule({
        frequency: "paused",
        cronExpression: null,
        jitterMinutes: 60,
        timezone: "UTC",
      }),
    );
    expect((await resource()).schedule).toMatchObject({ frequency: "paused", next_check_at: null });
    expect((await resource(peer.id)).schedule?.frequency).toBe("daily");
  });

  it("re-add defaults to Manual, cancels obsolete queued work and leaves paid running work alone", async () => {
    await apply([keywordId]);
    const before = await db.keyword.findUniqueOrThrow({ where: { id: keywordId } });
    const runData = {
      projectId,
      checkScheduleId: before.checkScheduleId,
      trigger: "scheduled",
      selectionKind: "scheduled_due",
      selectionHash: "fixture",
      selectionSpec: { occurrenceKey: "2026-10-21" },
      plannedFor: new Date("2026-10-21"),
      requestedCount: 1,
      totalCount: 1,
    };
    const queuedRun = await db.rankCheckRun.create({
      data: { ...runData, publicId: makePublicId("rcr"), status: "queued" },
    });
    const queuedItem = await db.rankCheckRunItem.create({
      data: { runId: queuedRun.id, keywordId, status: "queued", notBefore: new Date("2099-01-01") },
    });
    const paidRun = await db.rankCheckRun.create({
      data: { ...runData, publicId: makePublicId("rcr"), status: "running", costCents: 2 },
    });
    const paidCheck = await db.rankCheck.create({
      data: {
        publicId: makePublicId("check"),
        keywordId,
        runId: paidRun.id,
        provider: "serpapi",
        status: "running",
        costCents: 2,
      },
    });
    const paidItem = await db.rankCheckRunItem.create({
      data: {
        runId: paidRun.id,
        keywordId,
        rankCheckId: paidCheck.id,
        status: "running",
        startedAt: new Date(),
        actualCostCents: 2,
      },
    });
    await db.keyword.update({ data: { archivedAt: new Date() }, where: { id: keywordId } });
    const result = await db.$transaction((tx) =>
      createKeywordBatchSet(tx, projectId, [
        {
          keyword: "first",
          location: "United States",
          locationId,
          device: "desktop",
          schedule: null,
          tags: [],
        },
      ]),
    );
    expect(result.restored.map((row) => row.id)).toEqual([keywordId]);
    expect((await resource()).schedule).toMatchObject({ frequency: "manual", next_check_at: null });
    expect(await db.rankCheckRunItem.findUnique({ where: { id: queuedItem.id } })).toMatchObject({
      status: "cancelled",
      blockedReason: "schedule_changed",
      rankCheckId: null,
    });
    expect(await db.rankCheckRunItem.findUnique({ where: { id: paidItem.id } })).toMatchObject({
      status: "running",
      rankCheckId: paidCheck.id,
      actualCostCents: 2,
    });
    expect(await db.rankCheck.count({ where: { keywordId } })).toBe(1);
    expect(
      (await db.rankCheck.findUniqueOrThrow({ where: { id: paidCheck.id } })).costCents?.toNumber(),
    ).toBe(2);
  });

  it("honors a new explicit cadence on re-add after clearing the previous assignment", async () => {
    await apply([keywordId]);
    await db.keyword.update({ data: { archivedAt: new Date() }, where: { id: keywordId } });
    const weekly = normalizeSchedule({
      frequency: "weekly",
      cronExpression: null,
      jitterMinutes: 0,
      timezone: "UTC",
    });
    await db.$transaction(async (tx) => {
      const result = await createKeywordBatchSet(tx, projectId, [
        {
          keyword: "first",
          location: "United States",
          locationId,
          device: "desktop",
          schedule: weekly,
          tags: [],
        },
      ]);
      await assignCreatedKeywordCadences(tx, projectId, result.accepted, userId);
    });
    expect((await resource()).schedule).toMatchObject({
      frequency: "weekly",
      next_check_at: expect.any(String),
    });
  });

  it("preserves mixed legacy depth overrides when only frequency changes", async () => {
    const second = await keyword("depth peer");
    for (const [id, serpDepth] of [
      [keywordId, 20],
      [second.id, 50],
    ] as const)
      await db.keywordSchedule.create({
        data: { keywordId: id, frequency: "manual", timezone: "UTC", serpDepth },
      });
    await apply([keywordId, second.id]);
    const rows = await db.keyword.findMany({
      where: { projectId },
      include: { checkSchedule: true },
    });
    expect(rows.find((row) => row.id === keywordId)?.checkSchedule?.serpDepth).toBe(20);
    expect(rows.find((row) => row.id === second.id)?.checkSchedule?.serpDepth).toBe(50);
  });
  it("preserves assigned depth and pinned provider on frequency-only changes", async () => {
    await apply([keywordId], { ...daily(), serpDepth: 50 });
    const before = await db.keyword.findUniqueOrThrow({ where: { id: keywordId } });
    if (!before.checkScheduleId) throw new Error("Expected assigned fixture schedule");
    await db.checkSchedule.update({
      where: { id: before.checkScheduleId },
      data: { providerPolicy: "serpapi" },
    });
    await db.keywordSchedule.update({ where: { keywordId }, data: { serpDepth: 20 } });
    await apply(
      [keywordId],
      normalizeSchedule({
        frequency: "weekly",
        cronExpression: null,
        jitterMinutes: 60,
        timezone: "UTC",
      }),
    );
    const row = await db.keyword.findUniqueOrThrow({
      where: { id: keywordId },
      include: { checkSchedule: true },
    });
    expect(row.checkSchedule).toMatchObject({
      frequency: "weekly",
      serpDepth: 50,
      providerPolicy: "serpapi",
    });
  });
  it("preserves assigned depth in the Manual mirror after removing membership", async () => {
    await apply([keywordId], { ...daily(), serpDepth: 50 });
    await db.keywordSchedule.update({ where: { keywordId }, data: { serpDepth: 20 } });
    await apply(
      [keywordId],
      normalizeSchedule({
        frequency: "manual",
        cronExpression: null,
        jitterMinutes: 0,
        timezone: "UTC",
      }),
    );
    expect(await db.keywordSchedule.findUnique({ where: { keywordId } })).toMatchObject({
      frequency: "manual",
      serpDepth: 50,
    });
  });
  it.each([null, 50] as const)(
    "Remove from schedule preserves assigned depth %s instead of stale legacy depth",
    async (serpDepth) => {
      await apply([keywordId], { ...daily(), serpDepth });
      const row = await db.keyword.findUniqueOrThrow({
        where: { id: keywordId },
        include: { checkSchedule: true },
      });
      if (!row.checkSchedule) throw new Error("Expected assigned fixture schedule");
      await db.keywordSchedule.update({ where: { keywordId }, data: { serpDepth: 20 } });
      await removeKeywordsFromSchedule(userId, projectId, {
        projectId: projectPublicId as `prj_${string}`,
        scheduleId: row.checkSchedule.publicId as `sch_${string}`,
        keywordIds: [row.publicId as `kw_${string}`],
      });
      expect(await db.keywordSchedule.findUnique({ where: { keywordId } })).toMatchObject({
        frequency: "manual",
        serpDepth,
      });
      expect((await resource()).schedule).toMatchObject({
        frequency: "manual",
        next_check_at: null,
      });
    },
  );

  it("takes project lock before restoring a keyword while another membership writer owns it", async () => {
    await db.projectMarket.create({
      data: { projectId, locationId, publicId: makePublicId("pmkt") },
    });
    await db.keyword.update({ where: { id: keywordId }, data: { archivedAt: new Date() } });
    let ready!: () => void, reportPid!: (pid: number) => void;
    const locked = new Promise<void>((resolve) => {
      ready = resolve;
    });
    const pidReady = new Promise<number>((resolve) => {
      reportPid = resolve;
    });
    const assigner = db.$transaction(
      async (tx) => {
        await lockProjectForProviderMutation(tx, projectId);
        ready();
        const pid = await pidReady;
        const deadline = Date.now() + 5000;
        while (true) {
          const [state] = await db.$queryRaw<
            Array<{ waiting: boolean }>
          >`SELECT wait_event_type = 'Lock' AS waiting FROM pg_stat_activity WHERE pid = ${pid}`;
          if (state?.waiting) break;
          if (Date.now() > deadline) throw new Error("Re-add did not wait for the project lock");
          await new Promise((resolve) => setTimeout(resolve, 10));
        }
        // If restore already updated this row before waiting for project, NOWAIT fails deterministically.
        await tx.$queryRaw`SELECT id FROM keywords WHERE id = ${keywordId} FOR UPDATE NOWAIT`;
      },
      { timeout: 15_000 },
    );
    await locked;
    const readd = db.$transaction(
      async (tx) => {
        const [backend] = await tx.$queryRaw<
          Array<{ pid: number }>
        >`SELECT pg_backend_pid() AS pid`;
        reportPid(backend.pid);
        return createKeywordBatchSet(tx, projectId, [
          {
            keyword: "first",
            location: "United States",
            locationId,
            device: "desktop",
            schedule: null,
            tags: [],
          },
        ]);
      },
      { timeout: 15_000 },
    );
    const [, result] = await Promise.all([assigner, readd]);
    expect(result.restored.map((row) => row.id)).toEqual([keywordId]);
  }, 20_000);

  it("scopes membership writes to the authenticated project", async () => {
    const foreign = await db.project.create({
      data: {
        ownerId: userId,
        publicId: makePublicId("prj"),
        name: "Other",
        domain: "other.example.test",
      },
    });
    const other = await keyword("foreign", foreign.id);
    await apply([keywordId, other.id]);
    expect(
      (await db.keyword.findUniqueOrThrow({ where: { id: other.id } })).checkScheduleId,
    ).toBeNull();
    expect(await db.checkSchedule.count({ where: { projectId: foreign.id } })).toBe(0);
  });

  it("rolls back both the membership and cadence mirror on caller failure", async () => {
    await expect(
      db.$transaction(async (tx: Prisma.TransactionClient) => {
        await setKeywordCadence(tx, projectId, [keywordId], daily(), userId);
        throw new Error("caller rollback");
      }),
    ).rejects.toThrow("caller rollback");
    expect(
      (await db.keyword.findUniqueOrThrow({ where: { id: keywordId } })).checkScheduleId,
    ).toBeNull();
    expect(await db.keywordSchedule.count({ where: { keywordId } })).toBe(0);
    expect(await db.checkSchedule.count({ where: { projectId } })).toBe(0);
  });
});
