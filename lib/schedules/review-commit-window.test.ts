import { beforeEach, describe, expect, it, vi } from "vitest";
import { scheduleActionStatus } from "./action-result";
import { ScheduleReviewRequiredError, ScheduleReviewStaleError } from "./errors";
import type { ScheduleChange } from "./preview";
import { commitReviewedScheduleWrite } from "./review-commit";

const now = new Date("2026-10-08T12:00:00.000Z");
const mocks = vi.hoisted(() => ({ defaults: vi.fn(), rank: vi.fn(), transaction: vi.fn() }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    checkSchedule: { findFirst: mocks.rank },
    keyword: { count: vi.fn(async () => 2), findMany: vi.fn(async () => []) },
    projectDefaults: { findUnique: mocks.defaults },
    providerConnection: { findFirst: vi.fn(async () => null) },
    $transaction: mocks.transaction,
  },
}));

const actor = { id: "user_1", memberships: [] };
const scheduleId = "sch_a00000000000000000000000" as const;
const projectId = "prj_a00000000000000000000000" as const;
const rank = {
  archivedAt: null,
  cronExpression: null,
  enabled: true,
  frequency: "weekly" as const,
  jitterMinutes: 0,
  measurementEpoch: 4n,
  providerPolicy: "dataforseo",
  publicId: scheduleId,
  serpDepth: 20,
  timeOfDay: null,
  timezone: "UTC",
  updatedAt: new Date("2026-10-01T00:00:00.000Z"),
};

function change(frequency: "daily" | "monthly" | "weekly" = "daily"): ScheduleChange {
  return {
    body: {
      input: { frequency, projectId, scheduleId },
      kind: "rank" as const,
    },
    id: scheduleId,
    op: "update" as const,
  };
}

function write(
  options: Parameters<typeof commitReviewedScheduleWrite>[0]["options"],
  run?: (consent: unknown) => Promise<unknown>,
  at = now,
  who = actor,
  next: ScheduleChange = change(),
) {
  return commitReviewedScheduleWrite({
    actor: who,
    change: next,
    now: at,
    options,
    projectId: "project_1",
    run: run ?? (async () => "written"),
  });
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.defaults.mockResolvedValue({ serpDepth: 20, timezone: "UTC" });
  mocks.rank.mockResolvedValue(rank);
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => Promise<unknown>) =>
    callback({
      $queryRaw: vi.fn(async () => []),
      checkSchedule: {
        findFirst: mocks.rank,
        updateMany: vi.fn(async () => ({ count: 1 })),
      },
      keyword: { findMany: vi.fn(async () => []), updateMany: vi.fn(async () => ({ count: 0 })) },
      scheduleReviewReceipt: {
        create: vi.fn(async () => ({})),
        deleteMany: vi.fn(async () => ({ count: 0 })),
        findMany: vi.fn(async () => []),
      },
    }),
  );
});

describe("schedule review window", () => {
  it("ignores a forged window when the submission has no token", async () => {
    const run = vi.fn(async () => "written");
    const seasonal: ScheduleChange = {
      body: {
        input: {
          cronExpression: "0 9 * 2-6 *",
          frequency: "custom_cron",
          projectId,
          scheduleId,
        },
        kind: "rank",
      },
      id: scheduleId,
      op: "update",
    };
    await expect(
      write(
        { gate: true, review: { window_start: "2026-11-01T00:00:00.000Z" } },
        run,
        new Date("2026-11-15T12:00:00.000Z"),
        actor,
        seasonal,
      ),
    ).rejects.toBeInstanceOf(ScheduleReviewRequiredError);
    expect(run).not.toHaveBeenCalled();
  });

  it("maps a reused preview to 409", () => {
    expect(scheduleActionStatus(new ScheduleReviewStaleError("preview_reused"))).toBe(409);
  });
});
