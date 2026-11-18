import type { Actor } from "@/lib/auth/authorize";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
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

import { createProjectMarket } from "@/lib/markets/create";

it("refuses direct market paste before any writes and attaches a fresh signed preview", async () => {
  const db = ownedDb();
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const where = { projectId: seeded.projectId };
  const before = await db.keyword.count({ where });
  await expect(
    createProjectMarket(seeded.userId, seeded.projectId, {
      projectId: seeded.projectPublicId,
      canonicalKey: "US",
      countryCode: "US",
      languageCode: "en",
      kind: "country",
      devices: ["desktop"],
      method: { kind: "paste", text: "market bypass proof" },
      schedule: { kind: "existing", scheduleId: seeded.schedulePublicId },
    }),
  ).rejects.toMatchObject({ code: "schedule_review_required", preview: { requires_review: true } });
  expect(await db.keyword.count({ where })).toBe(before);
  expect(await db.projectMarket.count({ where })).toBe(0);
  expect(await db.keywordSchedule.count({ where: { keyword: where } })).toBe(0);
  expect(await db.scheduleReviewReceipt.count({ where })).toBe(0);
}, 60000);

import { createProjectMarket as createMarketAction } from "@/lib/actions/project-market-create";
import { makePublicId } from "@/lib/db/public-id";
import type { NewMarketCreateInput } from "@/lib/markets/create-input";
import { marketCreateChange } from "@/lib/markets/create-review-change";
import { isScheduleActionFailure } from "./action-result";
import { keywordCreateChange } from "./keyword-create-change";
import { previewScheduleChange } from "./preview";

const submission = (p: {
  preview_token: string | null;
  expected_revision: string;
  window_start: string;
}) => {
  if (!p.preview_token) throw new Error("Expected signed preview");
  return {
    preview_token: p.preview_token,
    expected_revision: p.expected_revision,
    window_start: p.window_start,
  };
};
async function setupMarket() {
  const db = ownedDb();
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  await db.providerConnection.create({
    data: {
      projectId: seeded.projectId,
      publicId: makePublicId("conn"),
      kind: "serp",
      provider: "dataforseo",
      status: "connected",
    },
  });
  return { db, ...seeded };
}
async function counts(projectId: string) {
  const db = ownedDb(),
    where = { projectId };
  return [
    await db.projectMarket.count({ where }),
    await db.checkSchedule.count({ where }),
    await db.keyword.count({ where }),
    await db.keywordSchedule.count({ where: { keyword: where } }),
    await db.scheduleReviewReceipt.count({ where }),
    await db.auditLog.count({ where }),
  ];
}
for (const mode of ["existing", "inline", "copy"] as const) {
  it(`${mode}: refuses atomically, binds full input, commits one receipt, rejects replay and matches tuple pricing`, async () => {
    const seed = await setupMarket();
    const { db, projectId, projectPublicId, schedulePublicId } = seed;
    const source = await db.keyword.findFirstOrThrow({ where: { projectId } });
    const sourceMarket = await db.projectMarket.create({
      data: {
        publicId: makePublicId("pmkt"),
        projectId,
        locationId: source.locationId,
        name: "Source",
        status: "active",
      },
    });
    const input: NewMarketCreateInput = {
      projectId: projectPublicId,
      canonicalKey: "US",
      countryCode: "US",
      languageCode: "en",
      kind: "country",
      devices: ["desktop", "mobile"],
      method:
        mode === "copy"
          ? { kind: "copy", sourceMarketId: sourceMarket.publicId }
          : { kind: "paste", text: "new term | /target" },
      schedule:
        mode === "inline"
          ? { kind: "inline", frequency: "weekly", timeOfDay: "09:45", name: "Custom clock" }
          : { kind: "existing", scheduleId: schedulePublicId },
    };
    const before = await counts(projectId);
    const refused = await createMarketAction(input);
    expect(refused).toMatchObject({
      ok: false,
      error: { status: 428, preview: { requires_review: true } },
    });
    expect(await counts(projectId)).toEqual(before);
    if (!isScheduleActionFailure(refused) || !refused.error.preview)
      throw new Error("Missing preview");
    const p = refused.error.preview,
      review = submission(p);
    const plain = await previewScheduleChange(
      projectId,
      seed.actor,
      keywordCreateChange({
        projectId: projectPublicId,
        keywords: [mode === "copy" ? source.text : "new term"],
        devices: input.devices,
        locations: [{ locationKey: "US" }],
        tags: [],
        ...(mode === "inline"
          ? {
              schedule: {
                frequency: "weekly",
                timezone: "UTC",
                jitterMinutes: 60,
                cronExpression: null,
                serpDepth: null,
              },
            }
          : { checkScheduleId: schedulePublicId }),
      }),
    );
    expect(p.cost_after_cents).toBe(plain.cost_after_cents);
    expect(p.cost_after_cents).not.toBeNull();
    for (const different of [
      { ...input, devices: ["mobile"] },
      { ...input, method: { kind: "paste", text: "different term" } },
      { ...input, schedule: { kind: "inline", frequency: "weekly", timeOfDay: "10:30" } },
    ]) {
      expect(await createMarketAction({ ...different, review })).toMatchObject({
        ok: false,
        error: { status: 409, preview: expect.any(Object) },
      });
      expect(await counts(projectId)).toEqual(before);
    }
    await expect(
      createProjectMarket(
        seed.userId,
        projectId,
        { ...input, review },
        {
          afterKeywordInsert: () => {
            throw new Error("Rollback proof");
          },
        },
      ),
    ).rejects.toThrow("Rollback proof");
    expect(await counts(projectId)).toEqual(before);
    expect(await createMarketAction({ ...input, review })).toMatchObject({ keywordCount: 2 });
    expect(await db.scheduleReviewReceipt.count({ where: { projectId } })).toBe(1);
    const created = await db.keyword.findMany({
      where: { projectId, locationId: { not: source.locationId } },
      include: { schedule: true, checkSchedule: true },
    });
    expect(created).toHaveLength(2);
    expect(created.every((row) => row.targetUrl === (mode === "copy" ? null : "/target"))).toBe(
      true,
    );
    if (mode === "inline")
      expect(created[0].checkSchedule).toMatchObject({
        timeOfDay: "09:45",
        cronExpression: "0 9 * * 1",
        name: "Custom clock",
        timezone: null,
      });
    const committed = await counts(projectId);
    expect(await createMarketAction({ ...input, review })).toMatchObject({
      ok: false,
      error: { status: 409 },
    });
    expect(await counts(projectId)).toEqual(committed);
  }, 60000);
}
it.each(["manual", "paused", "empty"] as const)(
  "%s market creation needs no spend review",
  async (mode) => {
    const seed = await setupMarket();
    if (mode === "paused")
      await seed.db.checkSchedule.update({
        where: { publicId: seed.schedulePublicId },
        data: { frequency: "paused" },
      });
    const input: NewMarketCreateInput = {
      projectId: seed.projectPublicId,
      canonicalKey: "US",
      countryCode: "US",
      languageCode: "en",
      kind: "country",
      devices: ["desktop"],
      method: mode === "empty" ? { kind: "empty" } : { kind: "paste", text: "manual term" },
      schedule:
        mode === "empty"
          ? null
          : mode === "manual"
            ? { kind: "manual" }
            : { kind: "existing", scheduleId: seed.schedulePublicId },
    };
    const preview = await previewScheduleChange(
      seed.projectId,
      seed.actor,
      marketCreateChange(input),
    );
    expect(preview.requires_review).toBe(false);
    expect(await createMarketAction(input)).toMatchObject({
      keywordCount: mode === "empty" ? 0 : 1,
    });
    expect(
      await seed.db.scheduleReviewReceipt.count({ where: { projectId: seed.projectId } }),
    ).toBe(0);
  },
  60000,
);
it("copy source changes invalidate the signed selection and roll back every row", async () => {
  const seed = await setupMarket();
  const row = await seed.db.keyword.findFirstOrThrow({ where: { projectId: seed.projectId } });
  const market = await seed.db.projectMarket.create({
    data: {
      publicId: makePublicId("pmkt"),
      projectId: seed.projectId,
      locationId: row.locationId,
      name: "Source",
    },
  });
  const input: NewMarketCreateInput = {
    projectId: seed.projectPublicId,
    canonicalKey: "US",
    countryCode: "US",
    languageCode: "en",
    kind: "country",
    devices: ["desktop"],
    method: { kind: "copy", sourceMarketId: market.publicId },
    schedule: { kind: "existing", scheduleId: seed.schedulePublicId },
  };
  const preview = await previewScheduleChange(
    seed.projectId,
    seed.actor,
    marketCreateChange(input),
  );
  await seed.db.keyword.update({ where: { id: row.id }, data: { text: "changed source" } });
  const before = await counts(seed.projectId);
  expect(await createMarketAction({ ...input, review: submission(preview) })).toMatchObject({
    ok: false,
    error: { status: 409, preview: { requires_review: true } },
  });
  expect(await counts(seed.projectId)).toEqual(before);
}, 60000);
