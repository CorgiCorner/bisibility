import "server-only";

import type { ResolveProviderRateInput } from "@/lib/provider-rates/resolver";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { resolveEffectiveSerpDepth, type SerpDepth, serpDepthValues } from "@/lib/serp/markets";

export type KeywordDetailDepthMenuKeyword = Pick<
  KeywordRow,
  "checkState" | "projectSerpDepth" | "schedule"
>;

export type KeywordDetailDepthMenuProviderRate = {
  configuredCostCents: unknown;
  providerId?: string | null;
  rateContext: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
};

export type KeywordDetailDepthMenuInput = {
  keyword: KeywordDetailDepthMenuKeyword;
  providerRate: KeywordDetailDepthMenuProviderRate;
};

export type KeywordDetailDepthMenuOption = {
  depth: SerpDepth;
  priceCents: number | null;
};

export type KeywordDetailDepthMenu = {
  oneTimeCheckLine: string;
  options: readonly KeywordDetailDepthMenuOption[];
  preselectedDepth: SerpDepth;
  trackedDepth: SerpDepth;
};

export function buildKeywordDetailDepthMenu(
  input: KeywordDetailDepthMenuInput,
): KeywordDetailDepthMenu {
  const trackedDepth = resolveEffectiveSerpDepth({
    projectDepth: input.keyword.projectSerpDepth,
    scheduleDepth: input.keyword.schedule.serp_depth,
  });
  const preselectedDepth: SerpDepth =
    input.keyword.checkState === "not_ranked" ? 100 : trackedDepth;

  return {
    oneTimeCheckLine: `One-time check - tracking stays at Top ${trackedDepth}.`,
    options: serpDepthValues.map((depth) => ({
      depth,
      priceCents: estimatedRankCheckCostCents(
        input.providerRate.providerId ?? undefined,
        depth,
        input.providerRate.configuredCostCents,
        input.providerRate.rateContext,
        { measuredRateBaselineDepth: trackedDepth },
      ),
    })),
    preselectedDepth,
    trackedDepth,
  };
}
