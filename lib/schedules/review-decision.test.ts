import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import type { LocalQuote } from "@/lib/local-monitoring/quote";
import { describe, expect, it } from "vitest";
import {
  aiUnitCents,
  localMonitorUnitCents,
  type ReviewCadence,
  reviewOccurrences,
} from "./review-cost";
import { assessScheduleSpend, type ScheduleSpend } from "./review-decision";

const now = new Date("2026-10-08T00:00:00.000Z");
const configuration: SourceConfiguration = {
  endpoint: "ai_optimization/chat_gpt/llm_scraper/task_post",
  engine: "chat_gpt",
  model: null,
  parameters: {},
  provider: "dataforseo",
  source: "consumer_scrape",
};

function cadence(patch: Partial<ReviewCadence> = {}): ReviewCadence {
  return {
    archived: false,
    cronExpression: null,
    enabled: true,
    frequency: "daily",
    jitterMinutes: 0,
    publicId: "sch_review",
    serpDepth: 20,
    timeOfDay: null,
    timezone: "UTC",
    ...patch,
  };
}

function spend(patch: Partial<ScheduleSpend>): ScheduleSpend {
  const base = cadence();
  return {
    after: { cadence: base, members: 1, unitCents: 10 },
    before: { cadence: base, members: 1, unitCents: 10 },
    manualToScheduled: false,
    now,
    operation: "update",
    projectDepth: 100,
    providerAfter: null,
    providerBefore: null,
    ...patch,
  };
}

describe("schedule spend review", () => {
  it("prices a rank create with no members as free", () => {
    const decision = assessScheduleSpend(
      spend({
        after: { cadence: cadence(), members: 0, unitCents: null },
        before: { cadence: null, members: 0, unitCents: 0 },
        operation: "create",
      }),
    );
    expect(decision).toMatchObject({
      cost_after_cents: 0,
      cost_before_cents: 0,
      requires_review: false,
      review_reasons: [],
    });
  });

  it("requires review when a rank cadence increases the projected cost", () => {
    const decision = assessScheduleSpend(
      spend({
        after: { cadence: cadence({ frequency: "daily" }), members: 2, unitCents: 4 },
        before: { cadence: cadence({ frequency: "weekly" }), members: 2, unitCents: 4 },
      }),
    );
    expect(decision.cost_after_cents).toBeGreaterThan(decision.cost_before_cents ?? 0);
    expect(decision.review_reasons).toEqual(["cost_increase"]);
  });

  it("lets a custom cron decrease through without review", () => {
    const decision = assessScheduleSpend(
      spend({
        after: {
          cadence: cadence({ cronExpression: "0 1 * * *", frequency: "custom_cron" }),
          members: 1,
          unitCents: 5,
        },
        before: {
          cadence: cadence({ cronExpression: "0 * * * *", frequency: "custom_cron" }),
          members: 1,
          unitCents: 5,
        },
      }),
    );
    expect(decision.cost_after_cents).toBeLessThan(decision.cost_before_cents ?? 0);
    expect(decision.requires_review).toBe(false);
  });

  it("does not review a same-cost custom cron hour change when the price is known", () => {
    const before = reviewOccurrences(
      cadence({ cronExpression: "0 1 * * *", frequency: "custom_cron" }),
      now,
    );
    const after = reviewOccurrences(
      cadence({ cronExpression: "0 2 * * *", frequency: "custom_cron" }),
      now,
    );
    expect(before).toBe(after);
    const decision = assessScheduleSpend(
      spend({
        after: {
          cadence: cadence({ cronExpression: "0 2 * * *", frequency: "custom_cron" }),
          members: 1,
          unitCents: 5,
        },
        before: {
          cadence: cadence({ cronExpression: "0 1 * * *", frequency: "custom_cron" }),
          members: 1,
          unitCents: 5,
        },
      }),
    );
    expect(decision.requires_review).toBe(false);
  });

  it("requires review when an AI configuration runs more often", () => {
    const unit = aiUnitCents([configuration], now);
    const decision = assessScheduleSpend(
      spend({
        after: {
          cadence: cadence({
            cronExpression: "0 * * * *",
            frequency: "custom_cron",
            serpDepth: null,
          }),
          members: 2,
          unitCents: unit,
        },
        before: {
          cadence: cadence({
            cronExpression: "0 9 * * 1",
            frequency: "custom_cron",
            serpDepth: null,
          }),
          members: 2,
          unitCents: unit,
        },
      }),
    );
    expect(decision.review_reasons).toContain("cost_increase");
  });

  it("reuses a local monitor recurring quote as the per-run price", () => {
    const unit = localMonitorUnitCents({
      nativeEstimates: [{ amount: "2.5", unit: "cents" }],
    } as unknown as LocalQuote);
    expect(unit).toBe(2.5);
    const decision = assessScheduleSpend(
      spend({
        after: {
          cadence: cadence({ frequency: "daily", serpDepth: null }),
          members: 1,
          unitCents: unit,
        },
        before: {
          cadence: cadence({ frequency: "monthly", serpDepth: null }),
          members: 1,
          unitCents: unit,
        },
      }),
    );
    const runs = reviewOccurrences(cadence({ frequency: "monthly", serpDepth: null }), now) ?? 0;
    expect(decision.cost_before_cents).toBe(Number(((unit ?? 0) * runs).toFixed(6)));
    expect(decision.review_reasons).toEqual(["cost_increase"]);
  });

  it.each([
    ["pause", "pause"],
    ["archive", "archive"],
    ["restore", "restore"],
    ["manual", "manual"],
    ["noop", "noop"],
  ] as const)("does not review %s", (_name, operation) => {
    const decision = assessScheduleSpend(
      spend({
        after: { cadence: cadence({ enabled: false }), members: 1, unitCents: null },
        before: { cadence: cadence(), members: 1, unitCents: null },
        operation,
      }),
    );
    expect(decision.requires_review).toBe(false);
  });

  it("flags a manual keyword that becomes scheduled", () => {
    const decision = assessScheduleSpend(
      spend({
        before: { cadence: null, members: 0, unitCents: 0 },
        manualToScheduled: true,
        operation: "assign",
      }),
    );
    expect(decision.review_reasons).toContain("manual_to_scheduled");
  });

  it("flags a provider route change even when the projected cost falls", () => {
    const decision = assessScheduleSpend(
      spend({
        after: { cadence: cadence(), members: 1, unitCents: 1 },
        before: { cadence: cadence(), members: 1, unitCents: 9 },
        providerAfter: "local-sequence",
        providerBefore: "dataforseo",
      }),
    );
    expect(decision.cost_after_cents).toBeLessThan(decision.cost_before_cents ?? 0);
    expect(decision.review_reasons).toEqual(["provider_route_change"]);
  });

  it("flags an unknown price unless the calendar is a proven decrease", () => {
    const unknown = assessScheduleSpend(
      spend({
        after: { cadence: cadence({ frequency: "daily" }), members: 1, unitCents: null },
        before: { cadence: cadence({ frequency: "weekly" }), members: 1, unitCents: null },
      }),
    );
    expect(unknown.cost_after_cents).toBeNull();
    expect(unknown.review_reasons).toEqual(["price_unknown"]);
    const decrease = assessScheduleSpend(
      spend({
        after: { cadence: cadence({ frequency: "weekly" }), members: 1, unitCents: null },
        before: { cadence: cadence({ frequency: "daily" }), members: 1, unitCents: null },
      }),
    );
    expect(decrease.requires_review).toBe(false);
  });

  it("does not treat a missed leap day as a priced decrease", () => {
    const later = new Date("2026-11-15T12:00:00.000Z");
    const decision = assessScheduleSpend(
      spend({
        after: {
          cadence: cadence({ cronExpression: "0 * 29 2 *", frequency: "custom_cron" }),
          members: 1,
          unitCents: 5,
        },
        before: { cadence: cadence({ frequency: "weekly" }), members: 1, unitCents: 5 },
        now: later,
      }),
    );
    expect(decision.review_reasons).toEqual(["price_unknown"]);
    expect(decision.requires_review).toBe(true);
  });

  it("does not treat disabling or archiving a restricted cron as an unknown price", () => {
    const restricted = cadence({ cronExpression: "0 9 1 * *", frequency: "custom_cron" });
    for (const patch of [{ enabled: false }, { archived: true }] as const) {
      const decision = assessScheduleSpend(
        spend({
          after: { cadence: cadence({ ...restricted, ...patch }), members: 1, unitCents: 5 },
          before: { cadence: restricted, members: 1, unitCents: 5 },
        }),
      );
      expect(decision.review_reasons).not.toContain("price_unknown");
      expect(decision.requires_review).toBe(false);
    }
  });

  it("does not treat an empty membership as a zero-year cron", () => {
    const restricted = cadence({ cronExpression: "0 9 1 * *", frequency: "custom_cron" });
    const decision = assessScheduleSpend(
      spend({
        after: { cadence: restricted, members: 0, unitCents: 5 },
        before: { cadence: restricted, members: 4, unitCents: 5 },
      }),
    );
    expect(decision.review_reasons).not.toContain("price_unknown");
    expect(decision.requires_review).toBe(false);
  });

  it("compares leap crons that both miss the sample year over four years", () => {
    const later = new Date("2026-11-15T12:00:00.000Z");
    const sparse = cadence({ cronExpression: "0 9 29 2 *", frequency: "custom_cron" });
    const dense = cadence({ cronExpression: "0 * 29 2 *", frequency: "custom_cron" });
    const quote = (before: ReviewCadence, after: ReviewCadence) =>
      assessScheduleSpend(
        spend({
          after: { cadence: after, members: 1, unitCents: 5 },
          before: { cadence: before, members: 1, unitCents: 5 },
          now: later,
        }),
      );
    expect(quote(sparse, dense).review_reasons).toEqual(["cost_increase"]);
    expect(quote(sparse, sparse).requires_review).toBe(false);
    expect(
      quote(
        cadence({ cronExpression: "0 9 1 1 *", frequency: "custom_cron" }),
        cadence({ cronExpression: "0 * 1 1 *", frequency: "custom_cron" }),
      ).requires_review,
    ).toBe(true);
    expect(quote(dense, sparse).requires_review).toBe(false);
  });
});
