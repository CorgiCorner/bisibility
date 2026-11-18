import { countCronRuns } from "@/lib/rank-check/cron-count";
import { describe, expect, it } from "vitest";
import type { ReviewCadence, ReviewFrequency } from "./review-cost";
import { reviewWindow } from "./review-cost";
import { assessScheduleSpend, type SpendQuote } from "./review-decision";
import { keywordCadenceRequiresReview } from "./review-decision-keywords";

const windows = [
  { mondays: 4, now: new Date("2026-11-16T12:00:00.000Z") },
  { mondays: 5, now: new Date("2026-11-15T12:00:00.000Z") },
] as const;

const swaps = [
  ["daily", "0 9 * * *"],
  ["weekly", "0 9 * * 1"],
  ["monthly", "0 9 1 * *"],
] as const;

function cadence(
  cronExpression: string | null,
  frequency: ReviewCadence["frequency"],
): ReviewCadence {
  return {
    archived: false,
    cronExpression,
    enabled: true,
    frequency,
    jitterMinutes: 0,
    publicId: "equal-rate",
    serpDepth: 10,
    timeOfDay: null,
    timezone: "UTC",
  };
}

function quote(cronExpression: string | null, frequency: ReviewFrequency): SpendQuote {
  return { cadence: cadence(cronExpression, frequency), members: 1, unitCents: 5 };
}

function decide(before: SpendQuote, after: SpendQuote, now: Date) {
  return assessScheduleSpend({
    after,
    before,
    manualToScheduled: false,
    now,
    operation: "update",
    projectDepth: 10,
    providerAfter: null,
    providerBefore: null,
  });
}

function keywordReview(
  beforeFrequency: ReviewFrequency,
  beforeCron: string | null,
  afterFrequency: ReviewFrequency,
  afterCron: string | null,
  now: Date,
) {
  return keywordCadenceRequiresReview(
    {
      archivedAt: null,
      cronExpression: beforeCron,
      enabled: true,
      frequency: beforeFrequency,
      providerPolicy: "dataforseo",
      serpDepth: 10,
    },
    {
      cronExpression: afterCron,
      frequency: afterFrequency,
      providerPolicy: "dataforseo",
      serpDepth: 10,
    },
    10,
    now,
    "dataforseo",
  );
}

describe("equal-rate cadence swaps", () => {
  it.each(windows)(
    "does not review a named frequency swapped with its matching cron when the window has $mondays Mondays",
    ({ mondays, now }) => {
      const window = reviewWindow(now);
      expect(countCronRuns("0 9 * * 1", window.start, window.end, "UTC")).toBe(mondays);
      expect(countCronRuns("0 9 1 * *", window.start, window.end, "UTC")).toBeGreaterThan(0);
      expect(countCronRuns("0 9 * * *", window.start, window.end, "UTC")).toBe(30);
      for (const [frequency, cron] of swaps) {
        const named = quote(null, frequency);
        const exact = quote(cron, "custom_cron");
        expect(decide(named, exact, now).requires_review, `${frequency} to ${cron}`).toBe(false);
        expect(decide(exact, named, now).requires_review, `${cron} to ${frequency}`).toBe(false);
        expect(
          keywordReview(frequency, null, "custom_cron", cron, now),
          `${frequency} to ${cron}`,
        ).toBe(false);
        expect(
          keywordReview("custom_cron", cron, frequency, null, now),
          `${cron} to ${frequency}`,
        ).toBe(false);
      }
    },
  );

  it("still reviews a priced weekly cadence against five month-days", () => {
    const now = new Date("2026-11-15T12:00:00.000Z");
    expect(keywordReview("weekly", null, "custom_cron", "0 9 1,7,14,21,28 * *", now)).toBe(true);
    expect(
      decide(quote(null, "weekly"), quote("0 9 1,7,14,21,28 * *", "custom_cron"), now)
        .requires_review,
    ).toBe(true);
  });

  it("reviews a custom cron with eleven runs a year becoming named monthly", () => {
    // Equal per-run price, one whole extra run per year: a real increase, not an averaging gap.
    const now = new Date("2027-03-10T12:00:00.000Z");
    const elevenRuns = "0 9 1 1-11 *";
    expect(
      decide(quote(elevenRuns, "custom_cron"), quote(null, "monthly"), now).requires_review,
    ).toBe(true);
    expect(keywordReview("custom_cron", elevenRuns, "monthly", null, now)).toBe(true);
    expect(
      decide(quote(null, "monthly"), quote(elevenRuns, "custom_cron"), now).requires_review,
    ).toBe(false);
  });

  it("still reviews one yearly cron becoming two yearly runs", () => {
    const now = new Date("2026-11-15T12:00:00.000Z");
    expect(
      decide(quote("0 9 1 1 *", "custom_cron"), quote("0 9 1,6 1 *", "custom_cron"), now)
        .requires_review,
    ).toBe(true);
  });
});
