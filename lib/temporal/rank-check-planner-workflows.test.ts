import { beforeEach, describe, expect, it, vi } from "vitest";
import { planRankCheckRunsWorkflow } from "./rank-check-planner-workflows";

const mocks = vi.hoisted(() => ({
  continueAsNew: vi.fn(),
  launch: vi.fn(),
  plan: vi.fn(),
}));

vi.mock("@temporalio/workflow", () => ({
  continueAsNew: mocks.continueAsNew,
  proxyActivities: vi.fn(() => ({
    launchDuePlannedRunsActivity: mocks.launch,
    planRankCheckRunsActivity: mocks.plan,
  })),
}));

describe("planRankCheckRunsWorkflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.launch.mockResolvedValue({ cursor: null, hasMore: false, launched: 2, scanned: 2 });
  });

  it("plans one 200-schedule page and launches due runs", async () => {
    mocks.plan.mockResolvedValue({
      blocked: 1,
      cursor: null,
      done: true,
      planned: 3,
      schedules: 4,
    });

    await expect(
      planRankCheckRunsWorkflow({
        blocked: 0,
        cursor: null,
        launched: 0,
        now: "2026-09-02T08:00:00.000Z",
        planned: 0,
        schedules: 0,
      }),
    ).resolves.toEqual({
      blocked: 1,
      launched: 2,
      now: "2026-09-02T08:00:00.000Z",
      planned: 3,
      schedules: 4,
    });
    expect(mocks.plan).toHaveBeenCalledWith({
      cursor: null,
      limit: 200,
      now: "2026-09-02T08:00:00.000Z",
    });
    expect(mocks.launch).toHaveBeenCalledWith({
      cursor: null,
      limit: 500,
      now: "2026-09-02T08:00:00.000Z",
    });
  });

  it("terminates after keyset-pagination over more than one page of blocked rows", async () => {
    mocks.plan.mockResolvedValue({
      blocked: 0,
      cursor: null,
      done: true,
      planned: 0,
      schedules: 0,
    });
    mocks.launch
      .mockResolvedValueOnce({
        cursor: { id: "blocked_500", plannedFor: "2026-09-02T08:00:00.000Z" },
        hasMore: true,
        launched: 0,
        scanned: 500,
      })
      .mockResolvedValueOnce({ cursor: null, hasMore: false, launched: 0, scanned: 1 });

    await expect(planRankCheckRunsWorkflow()).resolves.toMatchObject({ launched: 0 });

    expect(mocks.launch).toHaveBeenCalledTimes(2);
    expect(mocks.launch.mock.calls[1]?.[0]).toEqual({
      cursor: { id: "blocked_500", plannedFor: "2026-09-02T08:00:00.000Z" },
      limit: 500,
      now: expect.any(String),
    });
  });

  it("continues as new after each full page", async () => {
    mocks.plan.mockResolvedValue({
      blocked: 0,
      cursor: "schedule_200",
      done: false,
      planned: 5,
      schedules: 200,
    });
    mocks.continueAsNew.mockResolvedValue({ continued: true });

    await planRankCheckRunsWorkflow({
      blocked: 1,
      cursor: null,
      launched: 2,
      now: "2026-09-02T08:00:00.000Z",
      planned: 3,
      schedules: 0,
    });

    expect(mocks.continueAsNew).toHaveBeenCalledWith({
      blocked: 1,
      cursor: "schedule_200",
      launched: 4,
      now: "2026-09-02T08:00:00.000Z",
      planned: 8,
      schedules: 200,
    });
  });
});
