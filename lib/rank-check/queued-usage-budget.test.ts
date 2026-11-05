import { Context } from "@temporalio/activity";
import { afterEach, expect, it, vi } from "vitest";
import {
  activityAllowsAnotherSettlement,
  QUEUED_SETTLEMENT_RESERVE_MS,
} from "./queued-usage-budget";

afterEach(() => {
  vi.restoreAllMocks();
});

it("allows another settlement only when the activity can finish it and still return", () => {
  const started = 1_000_000;
  vi.spyOn(Context, "current").mockReturnValue({
    info: {
      currentAttemptScheduledTimestampMs: started,
      startToCloseTimeoutMs: QUEUED_SETTLEMENT_RESERVE_MS,
    },
  } as never);
  vi.spyOn(Date, "now").mockReturnValue(started);
  expect(activityAllowsAnotherSettlement()).toBe(true);
  vi.spyOn(Date, "now").mockReturnValue(started + 1);
  expect(activityAllowsAnotherSettlement()).toBe(false);
});

it("does not invent a budget when the call is not inside an activity", () => {
  vi.spyOn(Context, "current").mockImplementation(() => {
    throw new Error("no activity");
  });
  expect(activityAllowsAnotherSettlement()).toBe(true);
});
