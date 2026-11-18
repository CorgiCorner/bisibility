import { updateCheckSchedule } from "@/lib/actions/check-schedule";
import type { Actor } from "@/lib/auth/authorize";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { countCronRuns } from "@/lib/rank-check/cron-count";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { isScheduleActionFailure } from "./action-result";
import { reviewWindow } from "./review-cost";
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

it("refuses an unreviewed Feb 29 to daily edit that spends sooner, then accepts a fresh review", async () => {
  const db = state.db;
  if (!db) throw new Error("Missing owned fixture.");
  const window = reviewWindow(new Date());
  expect(countCronRuns("*/5 * 29 2 *", window.start, window.end, "UTC")).toBe(0);
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const where = { publicId: seeded.schedulePublicId };
  await db.checkSchedule.update({
    where,
    data: { cronExpression: "*/5 * 29 2 *", frequency: "custom_cron", serpDepth: 100 },
  });
  const input = {
    cronExpression: "0 9 * * *",
    frequency: "custom_cron" as const,
    projectId: seeded.projectPublicId,
    scheduleId: seeded.schedulePublicId,
    serpDepth: 10 as const,
  };
  const before = await db.checkSchedule.findUniqueOrThrow({ where });
  const audits = () => db.auditLog.count({ where: { projectId: seeded.projectId } });
  const auditCount = await audits();
  const missing = await updateCheckSchedule(input);
  expect(missing).toMatchObject({
    ok: false,
    error: { code: "schedule_review_required", status: 428 },
  });
  if (!isScheduleActionFailure(missing) || !missing.error.preview)
    throw new Error("Missing fresh preview.");
  expect(missing.error.preview.review_reasons).toContain("cost_increase");
  const afterRefusal = await db.checkSchedule.findUniqueOrThrow({ where });
  expect(afterRefusal).toMatchObject({
    cronExpression: before.cronExpression,
    frequency: before.frequency,
    serpDepth: before.serpDepth,
    updatedAt: before.updatedAt,
    measurementEpoch: before.measurementEpoch,
  });
  expect(await audits()).toBe(auditCount);
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(0);
  const preview = missing.error.preview;
  const review = {
    expected_revision: preview.expected_revision,
    preview_token: preview.preview_token,
    window_start: preview.window_start,
  };
  expect(isScheduleActionFailure(await updateCheckSchedule({ ...input, review }))).toBe(false);
  expect(await db.checkSchedule.findUniqueOrThrow({ where })).toMatchObject({
    cronExpression: "0 9 * * *",
    frequency: "custom_cron",
    serpDepth: 10,
  });
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(1);
}, 60000);
