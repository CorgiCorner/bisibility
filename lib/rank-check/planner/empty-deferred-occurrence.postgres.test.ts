import { randomUUID } from "node:crypto";
import { makePublicId } from "@/lib/db/public-id";
import { type Prisma, PrismaClient } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { persistOccurrence } from "./persist-occurrence";
import type { PlannerSchedule } from "./plan";
import { cancelObsoleteScheduleItems } from "./reconcile-scheduled-items";
import { scheduledRunMembers } from "./schedule-members";

const store = vi.hoisted(() => ({ db: undefined as unknown as PrismaClient }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    $transaction: (fn: (tx: Prisma.TransactionClient) => Promise<unknown>) =>
      store.db.$transaction(fn),
  },
}));
vi.mock("@/lib/notifications/realtime", () => ({ publishOperationChanged: vi.fn() }));
const url = process.env.PROVIDER_UI_TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (
  !url ||
  new URL(url).hostname !== "127.0.0.1" ||
  !["/credits_fixture", "/planner_fixture"].includes(new URL(url).pathname)
) {
  throw new Error("An owned loopback credits_fixture or planner_fixture database is required.");
}
const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url, max: 8 }) });
const now = new Date("2026-10-21T13:30:00Z");
const occurrence = {
  occurrenceKey: "2026-10-21",
  plannedFor: new Date("2026-10-21T00:00:00Z"),
  intervalMs: 86_400_000,
};
let userId: string;
let projectId: string;
let locationId: string;
let oldScheduleId: string;
let emptyId: string;
let keywordId: string;
let schedule: PlannerSchedule;

beforeEach(async () => {
  store.db = db;
  userId = randomUUID();
  projectId = randomUUID();
  locationId = randomUUID();
  keywordId = randomUUID();
  oldScheduleId = randomUUID();
  emptyId = randomUUID();
  const scheduleId = randomUUID();
  const schedulePublicId = makePublicId("sch");
  await db.user.create({
    data: {
      id: userId,
      publicId: makePublicId("usr"),
      email: `${userId}@example.test`,
      name: "Planner fixture",
    },
  });
  await db.project.create({
    data: {
      id: projectId,
      publicId: makePublicId("prj"),
      ownerId: userId,
      name: "Planner fixture",
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
  await db.projectMarket.create({
    data: { projectId, locationId, publicId: makePublicId("pmkt") },
  });
  for (const [id, publicId, frequency] of [
    [oldScheduleId, makePublicId("sch"), "weekly"],
    [scheduleId, schedulePublicId, "daily"],
  ] as const) {
    await db.checkSchedule.create({
      data: {
        id,
        publicId,
        projectId,
        name: frequency,
        frequency,
        timezone: "UTC",
        jitterMinutes: 0,
      },
    });
  }
  await db.keyword.create({
    data: {
      id: keywordId,
      publicId: makePublicId("kw"),
      projectId,
      text: "example",
      location: "United States",
      locationId,
      checkScheduleId: scheduleId,
    },
  });
  schedule = {
    createdAt: now,
    id: scheduleId,
    publicId: schedulePublicId,
    projectId,
    frequency: "daily",
    enabled: true,
    cronExpression: null,
    timeOfDay: null,
    timezone: "UTC",
    jitterMinutes: 0,
    keywords: [{ id: keywordId, publicId: makePublicId("kw"), locationId }],
    project: { defaults: { timezone: "UTC" }, markets: [{ locationId }] },
  };
  const selectionHash = scheduledRunMembers(schedule.keywords).selectionHash;
  const blocker = await db.rankCheckRun.create({
    data: {
      projectId,
      publicId: makePublicId("rcr"),
      checkScheduleId: oldScheduleId,
      selectionKind: "scheduled_due",
      selectionHash,
      selectionSpec: { occurrenceKey: "2026-10-21" },
      trigger: "scheduled",
      status: "queued",
      requestedCount: 1,
      targetCount: 1,
      totalCount: 1,
      plannedFor: occurrence.plannedFor,
      orchestrationWorkflowId: randomUUID(),
    },
  });
  await db.rankCheckRunItem.create({
    data: {
      runId: blocker.id,
      keywordId,
      status: "queued",
      notBefore: new Date("2026-10-25T11:39:33Z"),
    },
  });
  await db.rankCheckRun.create({
    data: {
      id: emptyId,
      projectId,
      publicId: makePublicId("rcr"),
      checkScheduleId: scheduleId,
      selectionKind: "scheduled_due",
      selectionHash,
      selectionSpec: {
        v: 1,
        kind: "scheduled_due",
        occurrenceKey: occurrence.occurrenceKey,
        checkScheduleId: schedulePublicId,
      },
      idempotencyKey: `plan:${schedulePublicId}:${occurrence.occurrenceKey}`,
      trigger: "scheduled",
      status: "completed",
      outcome: "deferred",
      blockedReason: "targets_in_progress",
      requestedCount: 1,
      skippedCount: 1,
      plannedFor: occurrence.plannedFor,
      finishedAt: new Date("2026-10-21T12:30:00Z"),
      orchestrationWorkflowId: randomUUID(),
    },
  });
});
afterEach(async () => {
  await db.auditLog.deleteMany({ where: { projectId } });
  await db.project.deleteMany({ where: { id: projectId } });
  await db.user.deleteMany({ where: { id: userId } });
  await db.location.deleteMany({ where: { id: locationId } });
});

async function clearObsoleteBlocker() {
  return db.$transaction(async (tx) => {
    await lockProjectForProviderMutation(tx, projectId);
    return cancelObsoleteScheduleItems(tx, oldScheduleId, {}, now);
  });
}
async function plan() {
  return persistOccurrence(schedule, occurrence, now);
}

describe("empty deferred occurrence recovery with real PostgreSQL", () => {
  it("waits for the obsolete blocker, then creates one unmaterialized replacement under concurrent planning", async () => {
    expect(await plan()).toBeNull();
    expect((await clearObsoleteBlocker()).cancelled).toBe(1);
    const old = await db.rankCheckRun.findUniqueOrThrow({ where: { id: emptyId } });
    const result = await Promise.all([plan(), plan()]);
    expect(result.filter(Boolean)).toHaveLength(1);
    expect(await plan()).toBeNull();
    const replacements = await db.rankCheckRun.findMany({
      where: { projectId, status: "planned" },
    });
    expect(replacements).toHaveLength(1);
    expect(replacements[0]).toMatchObject({
      idempotencyKey: `${old.idempotencyKey}:after:${old.publicId}`,
      launchedAt: null,
      startedAt: null,
      costCents: 0,
      targetCount: 0,
      totalCount: 0,
    });
    expect(replacements[0].selectionSpec).toMatchObject({
      replacesDeferredRunPublicId: old.publicId,
    });
    expect(await db.rankCheckRun.findUniqueOrThrow({ where: { id: emptyId } })).toEqual(old);
    expect(await db.rankCheck.count({ where: { keyword: { projectId } } })).toBe(0);
    expect(await db.queuedRankCheckBatch.count({ where: { projectId } })).toBe(0);
  });
  it.each([
    { startedAt: now },
    { launchedAt: now },
    { costCents: 1 },
    { estimatedCostCents: 1 },
    { outcome: "failed" },
    { blockedReason: "no_active_keywords" },
    { selectionHash: "changed-selection" },
    { targetCount: 1 },
    { skippedCount: 0 },
    { completedCount: 1 },
    { failedCount: 1 },
    { cancelledCount: 1 },
  ] as const)("preserves terminal or uncertain work %#", async (change) => {
    await clearObsoleteBlocker();
    await db.rankCheckRun.update({ where: { id: emptyId }, data: change });
    expect(await plan()).toBeNull();
  });
  it("never replaces a manual run even when it carries the planner key", async () => {
    await clearObsoleteBlocker();
    const old = await db.rankCheckRun.findUniqueOrThrow({ where: { id: emptyId } });
    await db.rankCheckRun.delete({ where: { id: emptyId } });
    await db.rankCheckRun.create({
      data: {
        projectId,
        checkScheduleId: schedule.id,
        publicId: old.publicId,
        orchestrationWorkflowId: old.orchestrationWorkflowId,
        selectionKind: "scheduled_due",
        selectionHash: old.selectionHash,
        selectionSpec: old.selectionSpec as Prisma.InputJsonValue,
        idempotencyKey: old.idempotencyKey,
        trigger: "manual",
        status: "completed",
        outcome: "deferred",
        blockedReason: "targets_in_progress",
        requestedCount: 1,
        skippedCount: 1,
        plannedFor: occurrence.plannedFor,
      },
    });
    expect(await plan()).toBeNull();
  });
  it("does not backfill an elapsed occurrence", async () => {
    await clearObsoleteBlocker();
    expect(
      await persistOccurrence(schedule, occurrence, new Date("2026-10-22T00:00:00Z")),
    ).toBeNull();
  });
});
