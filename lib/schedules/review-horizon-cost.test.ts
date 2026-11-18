import { describe, expect, it } from "vitest";
import type { ReviewCadence } from "./review-cost";
import { assessScheduleSpend, type SpendQuote } from "./review-decision";
import { keywordCadenceRequiresReview } from "./review-decision-keywords";

const now = new Date("2026-11-15T12:00:00.000Z");

function quote(cronExpression: string, members = 1, unitCents: number | null = 5): SpendQuote {
  const cadence: ReviewCadence = {
    archived: false,
    cronExpression,
    enabled: true,
    frequency: "custom_cron",
    jitterMinutes: 0,
    publicId: "horizon-cost",
    serpDepth: 10,
    timeOfDay: null,
    timezone: "UTC",
  };
  return { cadence, members, unitCents };
}

function decision(before: SpendQuote, after: SpendQuote, grouped: boolean) {
  const group = { after, before, providerAfter: "dataforseo", providerBefore: "dataforseo" };
  return assessScheduleSpend({
    ...group,
    groups: grouped ? [group] : undefined,
    manualToScheduled: false,
    now,
    operation: "update",
    projectDepth: 10,
  });
}

describe.each([false, true])("horizon cost comparison (grouped: %s)", (grouped) => {
  it("reviews daily to leap-day hourly when membership makes cost rise", () => {
    expect(decision(quote("0 9 * * *"), quote("0 * 29 2 *", 100), grouped).review_reasons).toEqual([
      "cost_increase",
    ]);
  });

  it("reviews unchanged leap-day cron when membership rises", () => {
    expect(
      decision(quote("0 9 29 2 *"), quote("0 9 29 2 *", 1000), grouped).review_reasons,
    ).toEqual(["cost_increase"]);
  });

  it("reviews unchanged leap-day cron when the per-member price rises", () => {
    expect(
      decision(quote("0 9 29 2 *"), quote("0 9 29 2 *", 1, 10), grouped).review_reasons,
    ).toEqual(["cost_increase"]);
  });

  it("allows more leap-day runs when membership makes total cost fall", () => {
    expect(decision(quote("0 9 29 2 *", 100), quote("0 * 29 2 *"), grouped).requires_review).toBe(
      false,
    );
  });

  it("requires review when the next 30 days cost more even if the four-year total falls", () => {
    expect(decision(quote("0 9 29 2 *", 2000), quote("0 9 * * *"), grouped).review_reasons).toEqual(
      ["cost_increase"],
    );
  });

  it("keeps the ordinary comparison when the target has no custom-cron horizon", () => {
    const after = quote("0 9 * * *");
    if (after.cadence) after.cadence.frequency = "daily";
    expect(decision(quote("0 9 29 2 *"), after, grouped).review_reasons).toEqual(["cost_increase"]);
  });

  it.each([
    ["0 9 * * *", "0 * 29 2 *", null, 5],
    ["0 * 29 2 *", "0 9 29 2 *", 5, null],
    ["0 9 29 2 *", "0 9 29 2 *", null, null],
  ])("keeps an unknown per-run price under review (%s to %s)", (before, after, left, right) => {
    expect(
      decision(quote(before, 1, left), quote(after, 1, right), grouped).review_reasons,
    ).toEqual(["price_unknown"]);
  });
});

describe("keyword horizon cost", () => {
  function requiresReview(before: string, after: string, beforeDepth: number, afterDepth: number) {
    return keywordCadenceRequiresReview(
      {
        archivedAt: null,
        cronExpression: before,
        enabled: true,
        frequency: "custom_cron",
        providerPolicy: "dataforseo",
        serpDepth: beforeDepth,
      },
      {
        cronExpression: after,
        frequency: "custom_cron",
        providerPolicy: "dataforseo",
        serpDepth: afterDepth,
      },
      10,
      now,
    );
  }

  it("reviews fewer leap-day runs when depth makes cost rise", () => {
    expect(requiresReview("0 * 29 2 *", "0 0-11 29 2 *", 10, 100)).toBe(true);
  });

  it("reviews unchanged leap-day cron when depth makes cost rise", () => {
    expect(requiresReview("0 9 29 2 *", "0 9 29 2 *", 10, 100)).toBe(true);
  });

  it("allows more leap-day runs when depth makes cost fall", () => {
    expect(requiresReview("0 0-11 29 2 *", "0 * 29 2 *", 100, 10)).toBe(false);
  });

  it("requires review when a leap cron becomes a weekly cron that starts spending within 30 days", () => {
    expect(requiresReview("0 * 29 2 *", "0 9 * * 1", 100, 10)).toBe(true);
  });

  it("reviews an unchanged leap-day cron when the per-run price is unknown", () => {
    expect(
      keywordCadenceRequiresReview(
        {
          archivedAt: null,
          cronExpression: "0 9 29 2 *",
          enabled: true,
          frequency: "custom_cron",
          serpDepth: 10,
        },
        { cronExpression: "0 9 29 2 *", frequency: "custom_cron" },
        10,
        now,
      ),
    ).toBe(true);
  });
});
