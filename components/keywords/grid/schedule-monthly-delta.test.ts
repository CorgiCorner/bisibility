import type { useNativeUsageFormat } from "@/components/cost-estimate/useNativeUsageFormat";
import { keywordRows } from "@/components/keywords/keywords-fixtures";
import { pagesPerCheck } from "@/lib/cost-estimate/estimate";
import type { NativeUsageEstimate } from "@/lib/cost-estimate/native-usage";
import { scheduledRunsPerMonth } from "@/lib/cost-estimate/project-estimate";
import type { KeywordRow } from "@/lib/queries/keywords";
import { defaultCostPerCheckCents } from "@/lib/rank-check/default-cost";
import type { SerpDepth } from "@/lib/serp/constants";
import type { RankCheckFrequency } from "@/lib/settings/options";
import keywordImportMessages from "@/messages/core/en/project-rank-tracker-keyword-import.json";
import sharedMessages from "@/messages/core/en/shared.json";
import { createTranslator } from "use-intl/core";
import { describe, expect, it } from "vitest";
import { scheduleMonthlyDeltaLabel } from "./schedule-monthly-delta";
import type { CheckScheduleSummary } from "./set-schedule-model";

const t = createTranslator({
  locale: "en",
  messages: keywordImportMessages,
  namespace: "projectRankTracker.keywordImport.management.schedule",
});

const nativeUsageT = createTranslator({
  locale: "en",
  messages: sharedMessages,
  namespace: "shared.nativeUsage",
});

const usage = {
  format: (estimate: Pick<NativeUsageEstimate, "unit" | "quantity">) =>
    estimate.unit === "units" && estimate.quantity !== null
      ? nativeUsageT("operations", { count: estimate.quantity })
      : nativeUsageT("unknown"),
} as unknown as ReturnType<typeof useNativeUsageFormat>;

const baseRow = keywordRows[0] as unknown as KeywordRow;

function row(overrides: {
  cronExpression?: string | null;
  frequency: RankCheckFrequency;
  projectSerpDepth?: SerpDepth;
  serpDepth?: SerpDepth | null;
}): KeywordRow {
  return {
    ...baseRow,
    checkSchedule: { name: "Current", nextCheckAt: null, publicId: "sch_current" },
    projectSerpDepth: overrides.projectSerpDepth,
    schedule: {
      ...baseRow.schedule,
      cron_expression: overrides.cronExpression ?? null,
      frequency: overrides.frequency,
      serp_depth: overrides.serpDepth ?? null,
    },
  };
}

function schedule(overrides: Partial<CheckScheduleSummary> = {}): CheckScheduleSummary {
  return {
    cronExpression: null,
    dayOfMonth: null,
    enabled: true,
    frequency: "daily",
    isDefault: false,
    jitterMinutes: 0,
    keywordCount: 1,
    name: "Destination",
    publicId: "sch_destination",
    serpDepth: null,
    timeOfDay: null,
    timezone: "UTC",
    weekday: null,
    ...overrides,
  };
}

function label(input: {
  providerRate: Parameters<typeof scheduleMonthlyDeltaLabel>[0]["providerRate"];
  rows: readonly KeywordRow[];
  schedule: CheckScheduleSummary | null;
}) {
  return scheduleMonthlyDeltaLabel({
    currentScheduleId: "sch_current",
    t,
    usage,
    ...input,
  });
}

const dailyRuns = scheduledRunsPerMonth("daily") ?? Number.NaN;
const twiceDailyRuns = scheduledRunsPerMonth("custom_cron", "0 6,18 * * *") ?? Number.NaN;

describe("scheduleMonthlyDeltaLabel", () => {
  it("prices a daily Top 10 to daily Top 100 move as extra monthly operations", () => {
    // Pinned to the month calculator's actual semantics: a daily cadence is 30 runs and
    // a check bills one page per 10 results.
    expect(dailyRuns).toBe(30);
    expect(pagesPerCheck(10)).toBe(1);
    expect(pagesPerCheck(100)).toBe(10);
    const expectedDelta = (pagesPerCheck(100) - pagesPerCheck(10)) * dailyRuns;

    const result = label({
      providerRate: { overrideCents: 999, providerId: "serpapi" },
      rows: [row({ cronExpression: "0 6 * * *", frequency: "daily", serpDepth: 10 })],
      schedule: schedule({ cronExpression: "0 6 * * *", serpDepth: 100 }),
    });

    expect(result).toBe(`+${expectedDelta} operations / month`);
    expect(result).not.toBe(t("monthlySame"));
  });

  it("falls back to the project depth when the destination has no depth override", () => {
    expect(pagesPerCheck(20)).toBe(2);
    const expectedDelta = (pagesPerCheck(20) - pagesPerCheck(100)) * dailyRuns;

    const result = label({
      providerRate: { overrideCents: 999, providerId: "serpapi" },
      rows: [
        row({
          cronExpression: "0 6 * * *",
          frequency: "daily",
          projectSerpDepth: 20,
          serpDepth: 100,
        }),
      ],
      schedule: schedule({ cronExpression: "0 6 * * *", serpDepth: null }),
    });

    expect(result).toBe(`${expectedDelta} operations / month`);
  });

  it("detects a custom cron cadence change at the same frequency", () => {
    expect(scheduledRunsPerMonth("custom_cron", "0 6 * * *")).toBe(30);
    expect(twiceDailyRuns).toBe(60);
    const expectedDelta = pagesPerCheck(100) * (twiceDailyRuns - 30);

    const result = label({
      providerRate: { overrideCents: 999, providerId: "serpapi" },
      rows: [row({ cronExpression: "0 6 * * *", frequency: "custom_cron", serpDepth: 100 })],
      schedule: schedule({
        cronExpression: "0 6,18 * * *",
        frequency: "custom_cron",
        serpDepth: 100,
      }),
    });

    expect(result).toBe(`+${expectedDelta} operations / month`);
  });

  it("reports removing the schedule as a negative manual delta", () => {
    const expectedDelta = -pagesPerCheck(10) * dailyRuns;

    const result = label({
      providerRate: { overrideCents: 999, providerId: "serpapi" },
      rows: [row({ cronExpression: "0 6 * * *", frequency: "daily", serpDepth: 10 })],
      schedule: null,
    });

    expect(result).toBe(`${expectedDelta} operations / month`);
  });

  it("keeps the metered cents counterpart for the same depth change", () => {
    // Pinned to the maintained list rates: a DataForSEO check costs 0.35 cents at Top 20
    // and 1.55 cents at Top 100. A configured override replaces the per-check amount, so
    // the depth-driven change is only visible on the list rates.
    expect(defaultCostPerCheckCents("dataforseo", 20)).toBe(0.35);
    expect(defaultCostPerCheckCents("dataforseo", 100)).toBe(1.55);
    const expectedCentsDelta = (1.55 - 0.35) * dailyRuns;

    const result = label({
      providerRate: { overrideCents: null, providerId: "dataforseo" },
      rows: [row({ cronExpression: "0 6 * * *", frequency: "daily", serpDepth: 20 })],
      schedule: schedule({ cronExpression: "0 6 * * *", serpDepth: 100 }),
    });

    expect(result).toBe(`+$${(expectedCentsDelta / 100).toFixed(2)} / month`);
  });

  it("does not invent a price for an unknown provider", () => {
    const result = label({
      providerRate: { overrideCents: null, providerId: "mystery-provider" },
      rows: [row({ cronExpression: "0 6 * * *", frequency: "daily", serpDepth: 10 })],
      schedule: schedule({ cronExpression: "0 6 * * *", serpDepth: 100 }),
    });

    expect(result).toBe(t("monthlyUnavailable"));
  });

  it("stays unavailable when the previous cadence cannot be computed", () => {
    const result = label({
      providerRate: { overrideCents: 999, providerId: "serpapi" },
      rows: [row({ cronExpression: null, frequency: "custom_cron", serpDepth: 100 })],
      schedule: schedule({ cronExpression: "0 6 * * *", serpDepth: 100 }),
    });

    expect(result).toBe(t("monthlyUnavailable"));
  });
});
