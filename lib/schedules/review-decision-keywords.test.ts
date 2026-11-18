import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import { describe, expect, it } from "vitest";
import { type ReviewCadence, rankUnitCents, reviewOccurrences } from "./review-cost";
import { keywordCadenceRequiresReview } from "./review-decision-keywords";

const now = new Date("2026-10-08T00:00:00.000Z");

function current(frequency: ReviewCadence["frequency"], extra: Record<string, unknown> = {}) {
  return {
    archivedAt: null,
    cronExpression: null,
    enabled: true,
    frequency,
    serpDepth: 20,
    ...extra,
  };
}

function priced(
  frequency: ReviewCadence["frequency"],
  depth: number,
  cronExpression: string | null = null,
) {
  const cadence: ReviewCadence = {
    archived: false,
    cronExpression,
    enabled: true,
    frequency,
    jitterMinutes: 0,
    publicId: "keyword-review",
    serpDepth: depth,
    timeOfDay: null,
    timezone: "UTC",
  };
  const runs = reviewOccurrences(cadence, now);
  const unit = rankUnitCents(depth as 10 | 20 | 50 | 100, "dataforseo");
  return {
    cents: runs === null || unit === null ? null : unit * runs,
    runs,
    unit,
    weight: runs === null ? null : runs * pagesPerCheck(depth as 10 | 20 | 50 | 100),
  };
}

describe("keyword cadence review without a provider rate", () => {
  it("still refuses increases, depth growth, and an unpriced cron hour change", () => {
    expect(
      keywordCadenceRequiresReview(
        current("weekly"),
        { cronExpression: null, frequency: "daily" },
        100,
        now,
      ),
    ).toBe(true);
    expect(
      keywordCadenceRequiresReview(
        current("daily"),
        { cronExpression: null, frequency: "daily", serpDepth: 50 },
        100,
        now,
      ),
    ).toBe(true);
    expect(
      keywordCadenceRequiresReview(
        current("custom_cron", { cronExpression: "0 1 * * *" }),
        { cronExpression: "0 2 * * *", frequency: "custom_cron" },
        100,
        now,
      ),
    ).toBe(true);
  });

  it("allows a custom cron decrease, a frequency decrease, manual, and pause", () => {
    expect(
      keywordCadenceRequiresReview(
        current("custom_cron", { cronExpression: "0 * * * *" }),
        { cronExpression: "0 1 * * *", frequency: "custom_cron" },
        100,
        now,
      ),
    ).toBe(false);
    expect(
      keywordCadenceRequiresReview(
        current("daily"),
        { cronExpression: null, frequency: "weekly" },
        100,
        now,
      ),
    ).toBe(false);
    expect(
      keywordCadenceRequiresReview(
        current("daily"),
        { cronExpression: null, frequency: "manual" },
        100,
        now,
      ),
    ).toBe(false);
    expect(
      keywordCadenceRequiresReview(
        current("daily"),
        { cronExpression: null, frequency: "paused" },
        100,
        now,
      ),
    ).toBe(false);
  });
});

describe("keyword cadence review with a provider price", () => {
  it("follows cents when frequency rises and depth falls", () => {
    const before = priced("weekly", 100);
    const after = priced("daily", 10);
    expect(before.cents).not.toBeNull();
    expect(after.cents).not.toBeNull();
    const requiresReview = (after.cents as number) > (before.cents as number);
    expect(after.weight).toBeLessThan(before.weight as number);
    expect(requiresReview).toBe(false);
    expect(
      keywordCadenceRequiresReview(
        current("weekly", { providerPolicy: "dataforseo", serpDepth: 100 }),
        { cronExpression: null, frequency: "daily", providerPolicy: "dataforseo", serpDepth: 10 },
        100,
        now,
      ),
    ).toBe(requiresReview);
  });

  it("does not review a same-cost hour change when the provider price is known", () => {
    const before = priced("custom_cron", 20, "0 1 * * *");
    const after = priced("custom_cron", 20, "0 2 * * *");
    expect(before.cents).toBe(after.cents);
    expect(before.weight).toBe(after.weight);
    expect(
      keywordCadenceRequiresReview(
        current("custom_cron", { cronExpression: "0 1 * * *", providerPolicy: "dataforseo" }),
        { cronExpression: "0 2 * * *", frequency: "custom_cron", providerPolicy: "dataforseo" },
        100,
        now,
      ),
    ).toBe(false);
  });
});

describe("uniform and restricted cadence averages", () => {
  function average(frequency: ReviewCadence["frequency"]): ReviewCadence {
    return {
      archived: false,
      cronExpression: null,
      enabled: true,
      frequency,
      jitterMinutes: 0,
      publicId: "average",
      serpDepth: 20,
      timeOfDay: null,
      timezone: "UTC",
    };
  }

  it("uses closed 30-day averages for daily, weekly and monthly", () => {
    const later = new Date("2026-11-15T12:00:00.000Z");
    expect(reviewOccurrences(average("daily"), later)).toBe(30);
    expect(reviewOccurrences(average("weekly"), later)).toBe(30 / 7);
    expect(reviewOccurrences(average("monthly"), later)).toBeCloseTo((30 * 12) / 365, 10);
  });

  it("requires review for weekly against five days a month on every start in a week", () => {
    for (let day = 0; day < 7; day += 1) {
      const later = new Date(Date.UTC(2026, 10, 15 + day, 12));
      expect(
        keywordCadenceRequiresReview(
          current("weekly"),
          { cronExpression: "0 9 1,7,14,21,28 * *", frequency: "custom_cron" },
          20,
          later,
        ),
      ).toBe(true);
    }
  });

  it("requires review for a leap-day cron that does not run from November 2026", () => {
    const later = new Date("2026-11-15T12:00:00.000Z");
    const leap = { cronExpression: "0 * 29 2 *", frequency: "custom_cron" as const };
    expect(
      keywordCadenceRequiresReview(
        current("weekly", { providerPolicy: "dataforseo" }),
        { ...leap, providerPolicy: "dataforseo" },
        20,
        later,
      ),
    ).toBe(true);
    expect(
      keywordCadenceRequiresReview(
        current("custom_cron", { ...leap, providerPolicy: "dataforseo" }),
        { ...leap, providerPolicy: "dataforseo" },
        20,
        later,
      ),
    ).toBe(false);
  });

  it("requires review when a zero-year cron replaces a cadence that does not run", () => {
    const later = new Date("2026-11-15T12:00:00.000Z");
    const leap = {
      cronExpression: "0 * 29 2 *",
      frequency: "custom_cron" as const,
      providerPolicy: "dataforseo",
    };
    expect(keywordCadenceRequiresReview(current("manual"), leap, 20, later)).toBe(true);
    expect(
      keywordCadenceRequiresReview(
        current("custom_cron", { ...leap, enabled: false }),
        leap,
        20,
        later,
      ),
    ).toBe(true);
    expect(keywordCadenceRequiresReview(null, leap, 20, later)).toBe(true);
  });

  it("compares leap crons that both miss the sample year over four years", () => {
    const later = new Date("2026-11-15T12:00:00.000Z");
    const sparse = {
      cronExpression: "0 9 29 2 *",
      frequency: "custom_cron" as const,
      providerPolicy: "dataforseo",
    };
    const dense = {
      cronExpression: "0 * 29 2 *",
      frequency: "custom_cron" as const,
      providerPolicy: "dataforseo",
    };
    expect(keywordCadenceRequiresReview(current("custom_cron", sparse), dense, 20, later)).toBe(
      true,
    );
    expect(keywordCadenceRequiresReview(current("custom_cron", sparse), sparse, 20, later)).toBe(
      false,
    );
    expect(
      keywordCadenceRequiresReview(
        current("custom_cron", {
          cronExpression: "0 9 1 1 *",
          frequency: "custom_cron",
          providerPolicy: "dataforseo",
        }),
        { cronExpression: "0 * 1 1 *", frequency: "custom_cron", providerPolicy: "dataforseo" },
        20,
        later,
      ),
    ).toBe(true);
    expect(keywordCadenceRequiresReview(current("custom_cron", dense), sparse, 20, later)).toBe(
      false,
    );
  });
});
