import { updateCheckSchedule } from "@/lib/actions/check-schedule";
import type { ApiContext } from "@/lib/api/context";
import { patchKeyword } from "@/lib/api/keywords";
import type { Actor } from "@/lib/auth/authorize";
import { PrismaClient } from "@/lib/generated/prisma/client";
import { countCronRuns } from "@/lib/rank-check/cron-count";
import { isScheduleActionFailure } from "@/lib/schedules/action-result";
import { reviewWindow } from "@/lib/schedules/review-cost";
import { seedReviewProject } from "@/lib/schedules/review-permit.postgres-fixture";
import { PrismaPg } from "@prisma/adapter-pg";
import { afterAll, beforeAll, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  actor: { id: "", memberships: [] } as Actor,
  db: undefined as PrismaClient | undefined,
  projectId: "",
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => state.actor,
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
  requireProjectScope: async () => ({ id: state.projectId }),
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

function apiContext(
  projectId: string,
  projectPublicId: string,
  actorId: string,
  body: unknown,
): ApiContext {
  const url = new URL("https://example.com/api/v1/keywords/kw_test");
  return {
    actorId,
    auth: { project: { id: projectId, publicId: projectPublicId } },
    headers: new Headers(),
    instance: "urn:test",
    method: "PATCH",
    origin: {
      credentialId: "key_test",
      credentialKind: "project_key",
      source: "api",
      surface: "programmatic",
    },
    path: ["api", "v1", "keywords", "kw_test"],
    req: new Request(url, {
      body: JSON.stringify(body),
      headers: { "content-type": "application/json" },
      method: "PATCH",
    }),
    url,
  } as ApiContext;
}

it("refuses the leap-cron keyword edit without a review, then commits it with a fresh review", async () => {
  const db = state.db;
  if (!db) throw new Error("Missing owned fixture.");
  const window = reviewWindow(new Date());
  expect(countCronRuns("0 * 29 2 *", window.start, window.end, "UTC")).toBe(0);
  expect(countCronRuns("0 9 * * 1", window.start, window.end, "UTC")).toBeGreaterThan(0);
  const seeded = await seedReviewProject(db);
  state.actor = seeded.actor;
  state.projectId = seeded.projectId;
  const where = { publicId: seeded.schedulePublicId };
  await db.checkSchedule.update({
    where,
    data: { cronExpression: "0 * 29 2 *", frequency: "custom_cron", serpDepth: 100 },
  });
  const keyword = await db.keyword.findFirstOrThrow({ where: { projectId: seeded.projectId } });
  const before = await db.checkSchedule.findUniqueOrThrow({ where });
  const audits = () => db.auditLog.count({ where: { projectId: seeded.projectId } });
  const schedules = () => db.checkSchedule.count({ where: { projectId: seeded.projectId } });
  const auditCount = await audits();
  const scheduleCount = await schedules();
  const response = await patchKeyword(
    apiContext(seeded.projectId, seeded.projectPublicId, seeded.userId, {
      schedule: {
        cron_expression: "0 9 * * 1",
        frequency: "custom_cron",
        jitter_minutes: 0,
        serp_depth: 10,
        timezone: "UTC",
      },
    }),
    keyword.publicId,
  );
  expect(response.status).toBe(428);
  expect(await response.json()).toMatchObject({ code: "schedule_review_required", status: 428 });
  const afterRefusal = await db.checkSchedule.findUniqueOrThrow({ where });
  expect(afterRefusal).toMatchObject({
    cronExpression: before.cronExpression,
    frequency: before.frequency,
    measurementEpoch: before.measurementEpoch,
    serpDepth: before.serpDepth,
    updatedAt: before.updatedAt,
  });
  expect((await db.keyword.findUniqueOrThrow({ where: { id: keyword.id } })).checkScheduleId).toBe(
    keyword.checkScheduleId,
  );
  expect(await audits()).toBe(auditCount);
  expect(await schedules()).toBe(scheduleCount);
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(0);

  const input = {
    cronExpression: "0 9 * * 1",
    frequency: "custom_cron" as const,
    projectId: seeded.projectPublicId,
    scheduleId: seeded.schedulePublicId,
    serpDepth: 10 as const,
  };
  const missing = await updateCheckSchedule(input);
  expect(missing).toMatchObject({
    error: { code: "schedule_review_required", status: 428 },
    ok: false,
  });
  if (!isScheduleActionFailure(missing) || !missing.error.preview)
    throw new Error("Missing fresh preview.");
  expect(missing.error.preview.review_reasons).toContain("cost_increase");
  const preview = missing.error.preview;
  expect(
    isScheduleActionFailure(
      await updateCheckSchedule({
        ...input,
        review: {
          expected_revision: preview.expected_revision,
          preview_token: preview.preview_token,
          window_start: preview.window_start,
        },
      }),
    ),
  ).toBe(false);
  expect(await db.checkSchedule.findUniqueOrThrow({ where })).toMatchObject({
    cronExpression: "0 9 * * 1",
    frequency: "custom_cron",
    serpDepth: 10,
  });
  expect(await db.scheduleReviewReceipt.count({ where: { projectId: seeded.projectId } })).toBe(1);
}, 60000);
