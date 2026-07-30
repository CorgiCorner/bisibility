import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  current: vi.fn(),
  syncTrafficForAllProjects: vi.fn(),
}));

vi.mock("@temporalio/activity", () => ({
  Context: { current: mocks.current },
}));

vi.mock("../traffic/sync", () => ({
  syncTrafficForAllProjects: mocks.syncTrafficForAllProjects,
}));

import { syncTrafficActivity } from "./traffic-activities";

describe("syncTrafficActivity", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.syncTrafficForAllProjects.mockResolvedValue({ projects: [], pruned: {} });
  });

  it("passes the Temporal activity scheduled timestamp to traffic runs", async () => {
    const startedAt = new Date("2026-07-16T07:00:05.000Z");
    const scheduledFor = new Date("2026-07-16T07:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(startedAt);
    mocks.current.mockReturnValue({
      info: { scheduledTimestampMs: scheduledFor.getTime() },
    });

    await syncTrafficActivity();

    expect(mocks.syncTrafficForAllProjects).toHaveBeenCalledWith(startedAt, scheduledFor);
  });

  it("uses null when invoked outside a Temporal activity", async () => {
    const startedAt = new Date("2026-07-16T07:00:05.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(startedAt);
    mocks.current.mockImplementation(() => {
      throw new Error("Not in an activity context");
    });

    await syncTrafficActivity();

    expect(mocks.syncTrafficForAllProjects).toHaveBeenCalledWith(startedAt, null);
  });
});
