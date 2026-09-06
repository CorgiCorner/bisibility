import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissRankRunNotice,
  isRankRunNoticeDismissed,
  NOTICE_DISMISSAL_TTL_MS,
  rankRunNoticeDismissalStorageKey,
} from "./notice-dismissals";

const runningNotice = { kind: "checks-running" as const, runId: "rcr_running" };
const failureNotice = { kind: "check-failures" as const, runId: "rcr_failed" };
const budgetNotice = { kind: "budget-exhausted" as const, capPeriod: "2026-09" };

describe("rank-run notice dismissals", () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("keys dismissals by notice kind and run id or cap period", () => {
    expect(rankRunNoticeDismissalStorageKey(runningNotice)).not.toBe(
      rankRunNoticeDismissalStorageKey(failureNotice),
    );
    expect(rankRunNoticeDismissalStorageKey(budgetNotice)).toContain("2026-09");

    dismissRankRunNotice(runningNotice);

    expect(isRankRunNoticeDismissed(runningNotice)).toBe(true);
    expect(isRankRunNoticeDismissed(failureNotice)).toBe(false);
    expect(isRankRunNoticeDismissed(budgetNotice)).toBe(false);
  });

  it("re-shows a notice when a new run or cap period appears", () => {
    dismissRankRunNotice(runningNotice);
    dismissRankRunNotice(budgetNotice);

    expect(isRankRunNoticeDismissed({ kind: "checks-running", runId: "rcr_new" })).toBe(false);
    expect(isRankRunNoticeDismissed({ kind: "budget-exhausted", capPeriod: "2026-10" })).toBe(
      false,
    );
  });

  it("uses TTL only as a safety net for dismissals", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00.000Z"));
    dismissRankRunNotice(runningNotice);

    expect(isRankRunNoticeDismissed(runningNotice)).toBe(true);

    vi.advanceTimersByTime(NOTICE_DISMISSAL_TTL_MS + 1);

    expect(isRankRunNoticeDismissed(runningNotice)).toBe(false);
  });
});
