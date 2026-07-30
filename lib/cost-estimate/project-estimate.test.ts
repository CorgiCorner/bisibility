import { describe, expect, it } from "vitest";
import {
  formatEstimateCents,
  frequencyDeltaCents,
  monthlyCostCentsFor,
  runCostCents,
  scheduledRunsPerMonth,
  unitCostCentsFor,
} from "./project-estimate";

const dataForSeo = { providerId: "dataforseo", overrideCents: null };
const volume = {
  depth: 100 as const,
  deviceCount: 1,
  keywordCount: 10,
  locationCount: 1,
};

describe("project estimates", () => {
  it("prefers a positive connection override", () => {
    expect(unitCostCentsFor({ providerId: "dataforseo", overrideCents: 7.5 }, 100)).toBe(7.5);
  });

  it("uses provider defaults when the override is absent", () => {
    expect(unitCostCentsFor(dataForSeo, 100)).toBeGreaterThan(0);
  });

  it("keeps an explicit zero-cost rate", () => {
    const free = { providerId: "local-sequence", overrideCents: 0 };
    expect(unitCostCentsFor(free, 100)).toBe(0);
    expect(monthlyCostCentsFor({ ...volume, frequency: "daily" }, free)).toBe(0);
    expect(runCostCents([10, 100], free)).toBe(0);
  });

  it.each([-1, Number.NaN, Number.POSITIVE_INFINITY])(
    "rejects an invalid override %s",
    (overrideCents) => {
      expect(unitCostCentsFor({ providerId: "dataforseo", overrideCents }, 100)).toBeNull();
      expect(
        monthlyCostCentsFor(
          { ...volume, frequency: "daily" },
          { providerId: "dataforseo", overrideCents },
        ),
      ).toBeNull();
    },
  );

  it("does not mistake a missing rate for zero cost", () => {
    expect(unitCostCentsFor({ providerId: null, overrideCents: null }, 100)).toBeNull();
  });

  it("prices manual and paused schedules at zero", () => {
    expect(monthlyCostCentsFor({ ...volume, frequency: "manual" }, dataForSeo)).toBe(0);
    expect(monthlyCostCentsFor({ ...volume, frequency: "paused" }, dataForSeo)).toBe(0);
  });

  it("uses the custom cron cadence", () => {
    expect(scheduledRunsPerMonth("custom_cron", "0 6 * * 1")).toBe(4);
    expect(scheduledRunsPerMonth("custom_cron", "*/15 6 * * *")).toBe(120);
    expect(scheduledRunsPerMonth("custom_cron", "5,10 6-7 * * 1")).toBe(16);
    expect(
      monthlyCostCentsFor(
        { ...volume, cronExpression: "0 6 * * 1", frequency: "custom_cron" },
        dataForSeo,
      ),
    ).toBe(monthlyCostCentsFor({ ...volume, frequency: "weekly" }, dataForSeo));
  });

  it("does not price custom cron without a parseable expression", () => {
    expect(scheduledRunsPerMonth("custom_cron")).toBeNull();
    expect(scheduledRunsPerMonth("custom_cron", "not a cron")).toBeNull();
    expect(monthlyCostCentsFor({ ...volume, frequency: "custom_cron" }, dataForSeo)).toBeNull();
  });

  it("computes schedule deltas", () => {
    expect(frequencyDeltaCents(volume, "weekly", "daily", dataForSeo)).toBeGreaterThan(0);
  });

  it("sums mixed-depth run costs", () => {
    expect(runCostCents([10, 100], dataForSeo)).toBe(1.75);
  });

  it("hides money for an unknown provider", () => {
    const unknown = { providerId: "unknown", overrideCents: null };
    expect(monthlyCostCentsFor({ ...volume, frequency: "daily" }, unknown)).toBeNull();
    expect(runCostCents([10], unknown)).toBeNull();
  });

  it("formats sub-cent estimates with a floor", () => {
    expect(formatEstimateCents(0.5)).toBe("< $0.01");
    expect(formatEstimateCents(0)).toBe("$0.00");
    expect(formatEstimateCents(125)).toBe("$1.25");
    expect(formatEstimateCents(-50)).toBe("-$0.50");
  });
});
