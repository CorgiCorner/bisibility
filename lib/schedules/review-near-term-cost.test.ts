import { describe, expect, it } from "vitest";
import type { ReviewCadence } from "./review-cost";
import { assessScheduleSpend, type SpendGroup, type SpendQuote } from "./review-decision";

const now = new Date("2026-11-15T12:00:00.000Z");

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
    publicId: "near-term",
    serpDepth: 10,
    timeOfDay: null,
    timezone: "UTC",
  };
}

function quote(
  cronExpression: string | null,
  frequency: ReviewCadence["frequency"],
  members = 1,
  unitCents: number | null = 5,
): SpendQuote {
  return { cadence: cadence(cronExpression, frequency), members, unitCents };
}

function decide(before: SpendQuote, after: SpendQuote, groups?: readonly SpendGroup[]) {
  const group = { after, before, providerAfter: null, providerBefore: null };
  return assessScheduleSpend({
    ...group,
    groups,
    manualToScheduled: false,
    now,
    operation: "update",
    projectDepth: 10,
  });
}

describe("near-term spend review", () => {
  it("requires cost_increase when a Feb 29 cron becomes daily at the same per-run price", () => {
    expect(decide(quote("0 9 29 2 *", "custom_cron"), quote(null, "daily")).review_reasons).toEqual(
      ["cost_increase"],
    );
    expect(
      decide(quote("0 9 29 2 *", "custom_cron"), quote("0 9 * * *", "custom_cron")).review_reasons,
    ).toEqual(["cost_increase"]);
  });

  it("requires cost_increase when the four-year total falls but the next 30 days cost more", () => {
    const decision = decide(
      quote("0 9 29 2 *", "custom_cron", 2000),
      quote("0 9 * * *", "custom_cron"),
    );
    expect(decision.cost_before_cents).toBe(0);
    expect(decision.cost_after_cents).toBe(150);
    expect(decision.review_reasons).toEqual(["cost_increase"]);
  });

  it("requires cost_increase when the same edit is one keyword group among a proven decrease", () => {
    const rising = {
      after: quote("0 9 * * *", "custom_cron"),
      before: quote("0 9 29 2 *", "custom_cron", 2000),
      providerAfter: null,
      providerBefore: null,
    };
    const decrease = {
      after: quote(null, "weekly", 1, null),
      before: quote(null, "daily", 1, null),
      providerAfter: null,
      providerBefore: null,
    };
    expect(decide(rising.before, rising.after, [rising, decrease]).review_reasons).toEqual([
      "cost_increase",
    ]);
  });

  it("keeps a real decrease, an equal near-term cost, and a longer horizon increase", () => {
    expect(decide(quote(null, "daily"), quote(null, "weekly"))).toMatchObject({
      cost_after_cents: 21.428571,
      cost_before_cents: 150,
      requires_review: false,
      review_reasons: [],
    });
    expect(
      decide(quote("0 9 * * *", "custom_cron"), quote("0 10 * * *", "custom_cron")),
    ).toMatchObject({
      cost_after_cents: 150,
      cost_before_cents: 150,
      requires_review: false,
      review_reasons: [],
    });
    expect(
      decide(quote("0 9 * * *", "custom_cron"), quote("0 * 29 2 *", "custom_cron", 100)),
    ).toMatchObject({
      cost_after_cents: 0,
      cost_before_cents: 150,
      requires_review: true,
      review_reasons: ["cost_increase"],
    });
  });

  it("keeps unknown prices on the price_unknown path", () => {
    expect(
      decide(
        quote("0 9 29 2 *", "custom_cron", 1, null),
        quote("0 9 * * *", "custom_cron", 1, null),
      ).review_reasons,
    ).toEqual(["price_unknown"]);
    expect(
      decide(quote(null, "daily", 1, null), quote(null, "weekly", 1, null)).requires_review,
    ).toBe(false);
    expect(
      decide(quote("0 9 * * *", "custom_cron", 1, null), quote("0 * 29 2 *", "custom_cron"))
        .review_reasons,
    ).toEqual(["price_unknown"]);
  });
});
