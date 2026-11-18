import { updateCheckSchedule } from "@/lib/actions/check-schedule";
import type { Actor } from "@/lib/auth/authorize";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { isScheduleActionFailure } from "./action-result";
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
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => state.actor,
  requireProjectScope: async () => ({ id: state.projectId }),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: new Proxy(
    {},
    {
      get: (_target, key) => {
        const db = state.db;
        if (!db) throw new Error("Owned database fixture is not ready.");
        const value = db[key as keyof PrismaClient];
        return typeof value === "function" ? value.bind(db) : value;
      },
    },
  ),
}));
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
it("refuses an unreviewed web increase without writes, then commits exactly once", async () => {
  const db = state.db;
  if (!db) throw new Error("Missing owned fixture.");
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const input = {
    projectId: seeded.projectPublicId,
    scheduleId: seeded.schedulePublicId,
    frequency: "daily",
  };
  const where = { publicId: seeded.schedulePublicId };
  const before = await db.checkSchedule.findUniqueOrThrow({ where });
  const audits = () => db.auditLog.count({ where: { projectId: seeded.projectId } });
  const auditCount = await audits();
  const missing = await updateCheckSchedule(input);
  expect(missing).toMatchObject({
    ok: false,
    error: { code: "schedule_review_required", status: 428 },
  });
  const afterRefusal = await db.checkSchedule.findUniqueOrThrow({ where });
  expect(afterRefusal).toMatchObject({
    frequency: before.frequency,
    updatedAt: before.updatedAt,
    measurementEpoch: before.measurementEpoch,
  });
  expect(await audits()).toBe(auditCount);
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(0);
  if (!isScheduleActionFailure(missing) || !missing.error.preview)
    throw new Error("Missing fresh preview.");
  const preview = missing.error.preview;
  const review = {
    expected_revision: preview.expected_revision,
    preview_token: preview.preview_token,
    window_start: preview.window_start,
  };
  expect(isScheduleActionFailure(await updateCheckSchedule({ ...input, review }))).toBe(false);
  expect(
    (await db.checkSchedule.findUniqueOrThrow({ where: { publicId: seeded.schedulePublicId } }))
      .frequency,
  ).toBe("daily");
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(1);
  expect(await updateCheckSchedule({ ...input, review })).toMatchObject({
    ok: false,
    error: { status: 409, preview: expect.any(Object) },
  });
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(1);
}, 60000);
