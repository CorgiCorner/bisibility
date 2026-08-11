import {
  buildKeywordDetailDepthMenu,
  type KeywordDetailDepthMenuInput,
} from "@/lib/keyword-detail/depth-menu";
import type { ResolveProviderRateInput } from "@/lib/provider-rates/resolver";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { serpDepthValues } from "@/lib/serp/markets";
import { describe, expect, it } from "vitest";

const measuredRateContext = {
  entries: [12, 17, 24, 37, 81].map((costCents) => ({
    cached: false,
    costCents,
    createdAt: new Date("2026-08-01T00:00:00.000Z"),
    failed: false,
  })),
  manualAmountCents: null,
} satisfies Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;

const baseSchedule = {
  cron_expression: null,
  frequency: "manual",
  jitter_minutes: 0,
  last_checked_at: null,
  next_check_at: null,
  timezone: "UTC",
} satisfies Omit<KeywordRow["schedule"], "serp_depth">;

function schedule(serpDepth: KeywordRow["schedule"]["serp_depth"]): KeywordRow["schedule"] {
  return { ...baseSchedule, serp_depth: serpDepth };
}

function input(
  overrides: {
    checkState?: KeywordDetailDepthMenuInput["keyword"]["checkState"];
    configuredCostCents?: unknown;
    projectSerpDepth?: KeywordDetailDepthMenuInput["keyword"]["projectSerpDepth"];
    providerId?: string | null;
    rateContext?: KeywordDetailDepthMenuInput["providerRate"]["rateContext"];
    scheduleDepth?: KeywordRow["schedule"]["serp_depth"];
  } = {},
): KeywordDetailDepthMenuInput {
  return {
    keyword: {
      checkState: overrides.checkState ?? "ranked",
      projectSerpDepth: overrides.projectSerpDepth === undefined ? 20 : overrides.projectSerpDepth,
      schedule: schedule(overrides.scheduleDepth === undefined ? 50 : overrides.scheduleDepth),
    },
    providerRate: {
      configuredCostCents: overrides.configuredCostCents ?? null,
      providerId: overrides.providerId === undefined ? "dataforseo" : overrides.providerId,
      rateContext: overrides.rateContext ?? measuredRateContext,
    },
  };
}

describe("buildKeywordDetailDepthMenu", () => {
  it("uses the snake_case schedule depth from the detail view model", () => {
    const realRow: Pick<KeywordRow, "checkState" | "projectSerpDepth" | "schedule"> = {
      checkState: "ranked" as const,
      projectSerpDepth: 10,
      schedule: { serp_depth: 50, ...baseSchedule },
    };

    const menu = buildKeywordDetailDepthMenu({
      keyword: realRow,
      providerRate: input().providerRate,
    });

    expect(menu.trackedDepth).toBe(50);
  });

  it("uses every supported depth in ascending order and delegates prices to the shared estimator", () => {
    const menu = buildKeywordDetailDepthMenu(input());

    expect(menu.options.map((option) => option.depth)).toEqual([10, 20, 50, 100]);
    expect(menu.options).toEqual(
      serpDepthValues.map((depth) => ({
        depth,
        priceCents: estimatedRankCheckCostCents("dataforseo", depth, null, measuredRateContext, {
          measuredRateBaselineDepth: menu.trackedDepth,
        }),
      })),
    );
    expect(menu).toMatchObject({
      oneTimeCheckLine: "One-time check - tracking stays at Top 50.",
      preselectedDepth: 50,
      trackedDepth: 50,
    });
  });

  it("does not flatten a measured rate across every depth", () => {
    const prices = buildKeywordDetailDepthMenu(input()).options.map((option) => option.priceCents);
    const measuredPrices = prices.filter((price): price is number => price !== null);

    expect(measuredPrices).toHaveLength(4);
    expect(new Set(measuredPrices).size).toBeGreaterThan(1);
    expect(measuredPrices).toEqual([...measuredPrices].sort((left, right) => left - right));
  });

  it("uses the project depth when the keyword schedule has no depth", () => {
    const menu = buildKeywordDetailDepthMenu(input({ projectSerpDepth: 20, scheduleDepth: null }));

    expect(menu.trackedDepth).toBe(20);
  });

  it("preselects Top 100 for an unranked keyword", () => {
    const menu = buildKeywordDetailDepthMenu(input({ checkState: "not_ranked" }));

    expect(menu.preselectedDepth).toBe(100);
  });

  it.each(["failed", "never_checked", "ranked", "running"] as const)(
    "preselects the tracked depth for a %s keyword",
    (checkState) => {
      const menu = buildKeywordDetailDepthMenu(input({ checkState }));

      expect(menu.preselectedDepth).toBe(menu.trackedDepth);
    },
  );

  it("preserves unavailable measured prices as null", () => {
    const menu = buildKeywordDetailDepthMenu(
      input({
        providerId: "unavailable-provider",
        rateContext: measuredRateContext,
      }),
    );

    expect(menu.options.map((option) => option.priceCents)).toEqual([null, null, null, null]);
    expect(menu.options.map((option) => option.priceCents)).not.toContain(0);
  });
});
