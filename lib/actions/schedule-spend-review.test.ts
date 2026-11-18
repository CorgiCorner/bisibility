import { previewScheduleChange, type ScheduleChange } from "@/lib/schedules/preview";
import type { ScheduleSpend } from "@/lib/schedules/review-decision";
import { clearScheduleReviewSpentForTests } from "@/lib/schedules/review-permit";
import { aiScheduleChange } from "@/lib/schedules/web-change";
import { beforeEach, expect, it, vi } from "vitest";
import { mutateAiTrackingAction } from "./ai-tracking";
import { stampAppScheduleInput } from "./ai-tracking-input";
import {
  assignKeywordsToCheckSchedule,
  createCheckSchedule,
  removeKeywordsFromCheckSchedule,
  updateCheckSchedule,
} from "./check-schedule";

const mock = vi.hoisted(() => ({
  write: vi.fn(),
  capacity: vi.fn(),
  spent: vi.fn(),
  load: vi.fn(),
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/schedules/review-load", () => ({ loadScheduleSpend: mock.load }));
vi.mock("@/lib/schedules/review-receipt", () => ({ consumeDurableScheduleReview: mock.spent }));
vi.mock("@/lib/capacity/capacity-extension", () => ({
  prepareResourceCapacity: async () => ({ enabled: false }),
}));
vi.mock("@/lib/actions/_shared", () => ({
  getActionActor: async () => ({ id: "owner", memberships: [] }),
  requireProjectScope: async () => ({ id: "project" }),
  parseActionInput: (schema: { parse: (input: unknown) => unknown }, input: unknown) =>
    schema.parse(input),
}));
vi.mock("@/lib/activity/app-mutation", () => ({ recordAppAction: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api/ai-tracking-audit", () => ({
  auditTrackingCatalog: vi.fn(),
  auditTrackingRun: vi.fn(),
}));
vi.mock("@/lib/ai-tracking/queries/project-engines", () => ({
  loadProjectEngineChoice: async () => ({ enabledEngines: [], engineDefault: null }),
}));
vi.mock("@/lib/api/ai-tracking-service", () => ({
  mutateTrackingCatalog: mock.write,
  trackingScope: async () => ({ id: "project" }),
  trackingCatalog: async () => [],
  trackingRuns: async () => ({ items: [], nextCursor: null }),
}));
vi.mock("@/lib/rank-check/schedules/service", () => ({
  createSchedule: mock.write,
  updateSchedule: mock.write,
  deleteSchedule: mock.write,
}));
vi.mock("@/lib/rank-check/schedules/service-membership", () => ({
  assignKeywordsToSchedule: mock.write,
  removeKeywordsFromSchedule: mock.write,
}));
vi.mock("@/lib/schedules/mutation-runs", () => ({
  setScheduleStateNow: mock.write,
  assertScheduleTransition: vi.fn(),
}));
vi.mock("@/lib/schedules/current-state", () => ({
  readScheduleState: async () => ({ state: "active" }),
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: { $transaction: async (run: (tx: object) => unknown) => run({}) },
}));
const projectId = "prj_a00000000000000000000000" as const;
const scheduleId = "sch_a00000000000000000000000" as const;
const membership = { projectId, scheduleId, keywordIds: ["kw_a00000000000000000000000"] };
const actor = { id: "owner", memberships: [] };
const input = { projectId, scheduleId, frequency: "daily" as const };
const cadence = (frequency: "weekly" | "daily") => ({
  frequency,
  enabled: true,
  archived: false,
  publicId: scheduleId,
  cronExpression: null,
  jitterMinutes: 0,
  timeOfDay: null,
  timezone: "UTC",
  serpDepth: 20,
});
let spend: ScheduleSpend;
let revision: string;
beforeEach(() => {
  clearScheduleReviewSpentForTests();
  vi.clearAllMocks();
  revision = "1";
  mock.write.mockResolvedValue({ publicId: scheduleId, updated: 1 });
  spend = {
    before: { cadence: cadence("weekly"), members: 1, unitCents: 1 },
    after: { cadence: cadence("daily"), members: 1, unitCents: 1 },
    manualToScheduled: false,
    now: new Date(),
    operation: "update",
    projectDepth: 20,
    providerAfter: null,
    providerBefore: null,
  };
  mock.load.mockImplementation(async () => ({
    spend: structuredClone(spend),
    revision,
    guard: { kind: "none" },
  }));
});
const cases: {
  name: string;
  change: ScheduleChange;
  submit: (review?: object) => Promise<unknown>;
}[] = [
  {
    name: "rank create",
    change: {
      op: "create",
      body: {
        kind: "rank",
        input: {
          projectId,
          cronExpression: null,
          name: "Daily",
          frequency: "daily",
          jitterMinutes: 60,
        },
      },
    },
    submit: (review) =>
      createCheckSchedule({
        projectId,
        cronExpression: null,
        name: "Daily",
        frequency: "daily",
        review,
      }),
  },
  {
    name: "rank edit",
    change: { op: "update", id: scheduleId, body: { kind: "rank", input } },
    submit: (review) => updateCheckSchedule({ ...input, review }),
  },
  {
    name: "rank activate/resume",
    change: {
      op: "state",
      id: scheduleId,
      command: { kind: "rank", projectPublicId: projectId },
      state: "active",
    },
    submit: (review) => updateCheckSchedule({ projectId, scheduleId, enabled: true, review }),
  },
  ...(["assign", "remove"] as const).map((operation) => ({
    name: `membership ${operation}`,
    change: {
      op: "update" as const,
      id: scheduleId,
      body: { kind: "rank-membership" as const, membership: membership as never, operation },
    },
    submit: (review?: object) =>
      (operation === "assign" ? assignKeywordsToCheckSchedule : removeKeywordsFromCheckSchedule)({
        ...membership,
        review,
      }),
  })),
  ...(["POST", "PATCH"] as const).map((method) => {
    const value = {
      name: "AI daily",
      cron: "0 9 * * *",
      timezone: "UTC",
      enabled: true,
      configuration: { promptIds: ["prompt"], configurations: [] },
    };
    const id = method === "POST" ? undefined : "ais_a00000000000000000000000";
    return {
      name: `AI ${method} create/edit/resume`,
      change: aiScheduleChange(method, stampAppScheduleInput(value, actor.id), id),
      submit: (review?: object) =>
        mutateAiTrackingAction(projectId, "schedules", method, value, id, review),
    };
  }),
];
it.each(cases)(
  "gates $name and returns a fresh preview on required/stale",
  async ({ change, submit }) => {
    const missing = await submit();
    expect(missing).toMatchObject({
      ok: false,
      error: { code: "schedule_review_required", status: 428, preview: { requires_review: true } },
    });
    expect(mock.write).not.toHaveBeenCalled();
    const preview = await previewScheduleChange("project", actor, change);
    const review = {
      expected_revision: preview.expected_revision,
      preview_token: preview.preview_token ?? "",
      window_start: preview.window_start,
    };
    revision = "2";
    expect(await submit(review)).toMatchObject({
      ok: false,
      error: { code: "schedule_review_stale", status: 409, preview: { expected_revision: "2" } },
    });
    expect(mock.write).not.toHaveBeenCalled();
    revision = "1";
    await submit(review);
    expect(mock.write).toHaveBeenCalledOnce();
    expect(mock.spent).toHaveBeenCalledOnce();
  },
);
it.each(cases)("allows a decrease through $name without review", async ({ submit }) => {
  [spend.before, spend.after] = [spend.after, spend.before];
  await submit();
  expect(mock.write).toHaveBeenCalledOnce();
  expect(mock.spent).not.toHaveBeenCalled();
});
it("orders review before capacity refusal and consumes no successful write", async () => {
  const { CapacityLimitError } = await import("@/lib/capacity/errors");
  mock.write.mockRejectedValue(
    new CapacityLimitError({
      dimension: "scheduledKeywords",
      limit: 1,
      used: 1,
      requested: 1,
      scope: "account",
    }),
  );
  expect(await updateCheckSchedule(input)).toMatchObject({ error: { status: 428 } });
  expect(mock.write).not.toHaveBeenCalled();
  const preview = await previewScheduleChange("project", actor, cases[1].change);
  expect(
    await updateCheckSchedule({
      ...input,
      review: {
        expected_revision: preview.expected_revision,
        preview_token: preview.preview_token,
        window_start: preview.window_start,
      },
    }),
  ).toMatchObject({ capacityFailure: { code: "plan_limit_reached" } });
});

it("maps an invalid review envelope without writing", async () => {
  const { splitScheduleReview } = await import("@/lib/schemas/schedule-review");
  let message = "";
  try {
    splitScheduleReview({ ...input, review: { preview_token: "" } });
  } catch (error) {
    if (error instanceof Error && "issues" in error)
      message = (error.issues as { message: string }[])[0].message;
  }
  expect(message).not.toBe("");
  await expect(
    updateCheckSchedule({ ...input, review: { preview_token: "" } }),
  ).resolves.toMatchObject({
    ok: false,
    error: { code: "schedule_review_invalid", status: 422, message },
  });
  expect(mock.write).not.toHaveBeenCalled();
});
