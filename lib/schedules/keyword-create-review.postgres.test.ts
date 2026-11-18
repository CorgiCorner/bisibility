import { normalizeSchedule } from "@/lib/actions/_schedule";
import { addKeywords, addKeywordsMatrix } from "@/lib/actions/keyword";
import { linkCheckSchedule } from "@/lib/actions/keyword-schedule-assignment";
import type { Actor } from "@/lib/auth/authorize";
import { makePublicId } from "@/lib/db/public-id";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { setKeywordCadence } from "@/lib/rank-check/schedules/keyword-cadence";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { isScheduleActionFailure } from "./action-result";
import { keywordCreateChange } from "./keyword-create-change";
import { commitKeywordCreate } from "./keyword-create-write";
import { previewScheduleChange } from "./preview";
import { seedReviewProject } from "./review-permit.postgres-fixture";

const state = vi.hoisted(() => ({
  db: undefined as PrismaClient | undefined,
  actor: { id: "", memberships: [] } as Actor,
  projectId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/actions/_shared", async (original) => ({
  ...(await original<typeof import("@/lib/actions/_shared")>()),
  getActionActor: async () => state.actor,
  requireProjectScope: async () =>
    ownedDb().project.findUniqueOrThrow({ where: { id: state.projectId } }),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/analytics/server", () => ({ readAnalyticsSurfaceFromHeaders: async () => null }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_, key) => {
        const db = state.db;
        if (!db) throw new Error("Owned database fixture is not ready.");
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));
function ownedDb() {
  if (!state.db) throw new Error("Missing owned fixture database.");
  return state.db;
}
beforeAll(() => {
  const url = process.env.DATABASE_URL;
  if (
    !url ||
    ["DIRECT_URL", "PROVIDER_UI_TEST_DATABASE_URL", "AI_TRACKING_TEST_DATABASE_URL"].some(
      (key) => process.env[key] !== url,
    )
  )
    throw new Error("All four owned fixture URLs are required.");
  const parsed = new URL(url);
  if (
    parsed.hostname !== "127.0.0.1" ||
    !["/credits_fixture", "/cadence_fixture"].includes(parsed.pathname) ||
    ["55441", "55447", "55448"].includes(parsed.port)
  )
    throw new Error("Owned fixture connection required.");
  state.db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
});
afterAll(async () => {
  await state.db?.$disconnect();
});

for (const mode of ["matrix", "rows", "batch", "cadence"] as const) {
  it(`${mode}: refuses before any keyword/schedule/receipt writes, binds input and commits once`, async () => {
    const db = ownedDb();
    const seeded = await seedReviewProject(db);
    await db.providerConnection.create({
      data: {
        projectId: seeded.projectId,
        publicId: makePublicId("conn"),
        kind: "serp",
        provider: "dataforseo",
        status: "connected",
      },
    });
    state.actor = seeded.actor;
    state.projectId = seeded.projectId;
    const shared = { projectId: seeded.projectPublicId, checkScheduleId: seeded.schedulePublicId };
    const input =
      mode === "matrix"
        ? {
            ...shared,
            keywords: ["new keyword", "second keyword"],
            devices: ["desktop" as const],
            locations: [{ locationKey: "US" }],
            tags: [],
          }
        : mode === "rows"
          ? {
              ...shared,
              rows: [
                { keyword: "new keyword", device: "mobile" as const, locationKey: "US" },
                { keyword: "second keyword", locationKey: "US" },
              ],
            }
          : {
              ...shared,
              ...(mode === "cadence"
                ? {
                    checkScheduleId: undefined,
                    schedule: {
                      frequency: "daily" as const,
                      cronExpression: null,
                      timezone: "UTC",
                      jitterMinutes: 0,
                      serpDepth: 50 as const,
                    },
                  }
                : {}),
              keywords: ["new keyword", "second keyword"],
              locationKey: "US",
            };
    const action = mode === "matrix" ? addKeywordsMatrix : addKeywords;
    const where = { projectId: seeded.projectId };
    const counts = async () => [
      await db.keyword.count({ where }),
      await db.checkSchedule.count({ where }),
      await db.keywordSchedule.count({ where: { keyword: where } }),
      await db.scheduleReviewReceipt.count({ where }),
      await db.auditLog.count({ where }),
    ];
    const before = await counts();
    const refused = await action(input);
    expect(refused).toMatchObject({
      ok: false,
      error: { status: 428, preview: { requires_review: true } },
    });
    expect(await counts()).toEqual(before);
    if (!isScheduleActionFailure(refused) || !refused.error.preview)
      throw new Error("Expected fresh preview");
    const preview = refused.error.preview;
    const review = {
      preview_token: preview.preview_token,
      expected_revision: preview.expected_revision,
      window_start: preview.window_start,
    };
    const different =
      mode === "rows"
        ? { ...input, rows: [{ keyword: "different", locationKey: "US" }] }
        : { ...input, keywords: ["different"] };
    expect(await action({ ...different, review })).toMatchObject({
      ok: false,
      error: { status: 409, preview: expect.any(Object) },
    });
    expect(await counts()).toEqual(before);
    expect(await action({ ...input, review })).toMatchObject({ created: 2 });
    expect(await db.scheduleReviewReceipt.count({ where })).toBe(1);
    const committed = await counts();
    expect(await action({ ...input, review })).toMatchObject({ ok: false, error: { status: 409 } });
    expect(await counts()).toEqual(committed);
    {
      const target = await db.keyword.findFirstOrThrow({
        where: { ...where, text: "new keyword" },
        include: { checkSchedule: true },
      });
      if (!target.checkSchedule)
        throw new Error("Created keywords must join their chosen cadence.");
      const ids = (
        await db.keyword.findMany({
          where: { ...where, text: { in: ["new keyword", "second keyword"] } },
        })
      ).map((row) => row.publicId);
      // Compare the identical persisted keywords from a manual before-state.
      await db.keyword.updateMany({
        where: { publicId: { in: ids } },
        data: { checkScheduleId: null },
      });
      const existing = await previewScheduleChange(seeded.projectId, seeded.actor, {
        op: "keywords",
        keywordIds: ids,
        scheduleId: target.checkSchedule.publicId,
      });
      expect(preview.cost_after_cents).not.toBeNull();
      expect(existing.cost_after_cents).toBe(preview.cost_after_cents);
    }
  }, 60000);
}
it("restored keywords count as joins; active duplicates and manual creates need no review", async () => {
  const db = ownedDb();
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const input = { projectId: seeded.projectPublicId, keywords: ["restore me"], locationKey: "US" };
  expect(await addKeywords(input)).toMatchObject({ created: 1 });
  await db.keyword.updateMany({
    where: { projectId: seeded.projectId, text: "restore me" },
    data: { archivedAt: new Date() },
  });
  const assigned = { ...input, checkScheduleId: seeded.schedulePublicId };
  const missing = await addKeywords(assigned);
  expect(missing).toMatchObject({ ok: false, error: { status: 428 } });
  expect(
    await db.keyword.count({
      where: { projectId: seeded.projectId, text: "restore me", archivedAt: { not: null } },
    }),
  ).toBe(1);
  if (!isScheduleActionFailure(missing) || !missing.error.preview)
    throw new Error("Expected preview");
  const p = missing.error.preview;
  expect(
    await addKeywords({
      ...assigned,
      review: {
        preview_token: p.preview_token,
        expected_revision: p.expected_revision,
        window_start: p.window_start,
      },
    }),
  ).toMatchObject({ created: 0 });
  expect(await addKeywords(assigned)).toMatchObject({ created: 0 });
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(1);
}, 60000);
it("shared assignment and direct cadence reject unreviewed increases inside their transaction", async () => {
  const db = ownedDb();
  const seeded = await seedReviewProject(db);
  const schedule = await db.checkSchedule.findUniqueOrThrow({
    where: { publicId: seeded.schedulePublicId },
  });
  const row = await db.keyword.findFirstOrThrow({ where: { projectId: seeded.projectId } });
  await db.keyword.update({ where: { id: row.id }, data: { checkScheduleId: null } });
  for (const run of [
    () => db.$transaction((tx) => linkCheckSchedule(tx, seeded.projectId, schedule, [row])),
    () =>
      db.$transaction((tx) =>
        setKeywordCadence(
          tx,
          seeded.projectId,
          [row.id],
          normalizeSchedule({
            frequency: "daily",
            timezone: "UTC",
            jitterMinutes: 0,
            cronExpression: null,
          }),
          seeded.userId,
          "schedule",
        ),
      ),
  ]) {
    await expect(run()).rejects.toMatchObject({ code: "schedule_review_required" });
    expect(
      (await db.keyword.findUniqueOrThrow({ where: { id: row.id } })).checkScheduleId,
    ).toBeNull();
  }
}, 60000);

it("paused destinations and cadence decreases do not consume review receipts", async () => {
  const db = ownedDb();
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const row = await db.keyword.findFirstOrThrow({ where: { projectId: seeded.projectId } });
  await db.$transaction((tx) =>
    setKeywordCadence(
      tx,
      seeded.projectId,
      [row.id],
      normalizeSchedule({
        frequency: "monthly",
        timezone: "UTC",
        jitterMinutes: 0,
        cronExpression: null,
      }),
      seeded.userId,
      "schedule",
    ),
  );
  const paused = await db.checkSchedule.create({
    data: {
      projectId: seeded.projectId,
      publicId: makePublicId("sch"),
      name: "Paused",
      providerPolicy: "dataforseo",
      frequency: "paused",
      enabled: true,
    },
  });
  expect(
    await addKeywords({
      projectId: seeded.projectPublicId,
      keywords: ["paused keyword"],
      locationKey: "US",
      checkScheduleId: paused.publicId,
    }),
  ).toMatchObject({ created: 1 });
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(0);
}, 60000);

it("rolls back the durable receipt when creation fails and permits a retry", async () => {
  const db = ownedDb();
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const input = {
    projectId: seeded.projectPublicId,
    keywords: ["rollback keyword"],
    locationKey: "US",
    checkScheduleId: seeded.schedulePublicId,
  };
  const change = keywordCreateChange(input);
  const preview = await previewScheduleChange(seeded.projectId, seeded.actor, change);
  if (!preview.preview_token) throw new Error("Expected signed preview.");
  const review = {
    preview_token: preview.preview_token,
    expected_revision: preview.expected_revision,
    window_start: preview.window_start,
  };
  await expect(
    commitKeywordCreate(seeded.projectId, seeded.actor, change, review, async (tx, admission) => {
      const source = await tx.keyword.findFirstOrThrow({ where: { projectId: seeded.projectId } });
      const rogue = await tx.keyword.create({
        data: {
          projectId: seeded.projectId,
          locationId: source.locationId,
          location: source.location,
          publicId: makePublicId("kw"),
          text: "unreviewed replacement",
        },
      });
      const target = await tx.checkSchedule.findUniqueOrThrow({
        where: { publicId: seeded.schedulePublicId },
      });
      await linkCheckSchedule(tx, seeded.projectId, target, [rogue], admission);
    }),
  ).rejects.toMatchObject({ code: "schedule_review_stale" });
  expect(
    await db.keyword.count({
      where: { projectId: seeded.projectId, text: "unreviewed replacement" },
    }),
  ).toBe(0);
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(0);
  expect(await addKeywords({ ...input, review })).toMatchObject({ created: 1 });
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(1);
}, 60000);
