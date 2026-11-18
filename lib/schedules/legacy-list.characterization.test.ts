import { defaultPromptRunEstimateUsd } from "@/lib/ai-tracking/tracking-engine-prices";
import { monthlyCostCentsFor, scheduledRunsPerMonth } from "@/lib/cost-estimate/project-estimate";
import { scheduledRunProjection } from "@/lib/queries/check-schedule-list";
import { describe, expect, it, vi } from "vitest";
import { aiFixture, priceNow, rankFixture } from "./list.test-fixture";

vi.mock("@/lib/db/prisma", () => ({ prisma: {} }));

describe("current schedule pricing characterization", () => {
  it("keeps rank target membership, per-run rounding and monthly cadence", () => {
    const projection = scheduledRunProjection(
      {
        keywords: [
          { device: "desktop", locationId: "market_1", text: "coffee" },
          { device: "desktop", locationId: "market_2", text: "coffee" },
        ],
        serpDepth: 20,
      },
      20,
      { provider: "serpapi", costPerCheckCents: 12 } as never,
    );
    expect(projection).toMatchObject({ keywordCount: 1, targetCount: 2, estimatedCostCents: 24 });
    expect(
      monthlyCostCentsFor(
        {
          depth: 20,
          keywordCount: 1,
          locationCount: 2,
          deviceCount: 1,
          frequency: rankFixture.frequency,
        },
        { providerId: "serpapi", overrideCents: 12 },
      ),
    ).toBe(720);
  });

  it("uses the AI page's fresh server price and hides stale prices", () => {
    const perRun = defaultPromptRunEstimateUsd(aiFixture.promptIds.length, priceNow.getTime());
    expect(perRun).toBe(0.24);
    expect((perRun ?? 0) * 100 * (scheduledRunsPerMonth("custom_cron", aiFixture.cron) ?? 0)).toBe(
      96,
    );
    expect(defaultPromptRunEstimateUsd(2, Date.parse("2026-11-13T00:00:00Z"))).toBeNull();
  });
});
