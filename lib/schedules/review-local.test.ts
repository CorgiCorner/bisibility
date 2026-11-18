import { policy } from "@/lib/local-monitor-recurring/recurring.test-fixture";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduleReviewGateError } from "./errors";
import { previewScheduleChange } from "./preview";
import { commitReviewedScheduleWrite } from "./review-commit";

const now = new Date("2026-10-08T12:00:00.000Z");
const monitorId = "mon_a00000000000000000000000";
const mocks = vi.hoisted(() => ({
  approval: vi.fn(),
  list: vi.fn(),
  monitor: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/providers/crypto", () => ({
  getPurposeSecretKeys: () => [Buffer.from("synthetic-schedule-review-key-0123456789")],
}));
vi.mock("./local-monitors", () => ({ listLocalMonitorSchedules: mocks.list }));
vi.mock("@/lib/db/prisma", () => ({
  prisma: {
    localMonitor: { findFirst: mocks.monitor },
    localMonitorRecurringApproval: { findFirst: mocks.approval },
    projectDefaults: { findUnique: vi.fn(async () => ({ serpDepth: 20, timezone: "UTC" })) },
  },
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.list.mockResolvedValue([
    {
      cadence: {
        cron_expression: null,
        frequency: "daily",
        time_of_day: null,
        timezone: "UTC",
      },
      id: monitorId,
      monthly_cost_estimate_cents: 0,
      state: "paused",
    },
  ]);
  mocks.monitor.mockResolvedValue({ currentScheduleIntentId: "intent_1" });
  mocks.approval.mockResolvedValue({ snapshot: policy });
});

describe("local monitor review price", () => {
  it("prices a resumed paused monitor from the recurring quote, not a zero monthly total", async () => {
    const preview = await previewScheduleChange(
      "project_1",
      { id: "user_1", memberships: [] },
      {
        command: { kind: "local_monitor" },
        id: monitorId,
        op: "state",
        state: "active",
      },
      now,
    );
    expect(preview.cost_before_cents).toBe(0);
    expect(preview.cost_after_cents).toBeGreaterThan(0);
    expect(preview.requires_review).toBe(true);
  });

  it("refuses a gated resume until the monitor write shares the review transaction", async () => {
    const run = vi.fn(async () => "resumed");
    await expect(
      commitReviewedScheduleWrite({
        actor: { id: "user_1", memberships: [] },
        change: {
          command: { kind: "local_monitor" },
          id: monitorId,
          op: "state",
          state: "active",
        },
        now,
        options: { gate: true },
        projectId: "project_1",
        run,
      }),
    ).rejects.toBeInstanceOf(ScheduleReviewGateError);
    expect(run).not.toHaveBeenCalled();
  });
});
