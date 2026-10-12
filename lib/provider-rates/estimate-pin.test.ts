import {
  estimatedFeatureCostCents,
  keywordMetricsRate,
  keywordResearchRate,
  rankedKeywordPageRate,
} from "@/lib/cost-estimate/provider-rates";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import { DEFAULT_SERP_DEPTH } from "@/lib/serp/constants";
import { describe, expect, it } from "vitest";
import { LIST_PROVIDER_RATE_CONTEXT } from "./resolver";

// Pin list, manual, and measured estimates separately so adopting a new catalog price
// cannot silently reprice manual overrides or retained measurements.
const at = new Date("2026-10-01T00:00:00.000Z");
const sample = (costCents: string, unitCostCents: string | null = null) => ({
  cached: false,
  costCents,
  createdAt: at,
  failed: false,
  unitCostCents,
});
const samples = (costs: readonly string[], units: readonly (string | null)[] = []) => ({
  entries: costs.map((cost, index) => sample(cost, units[index] ?? null)),
  manualAmountCents: null,
});
const contexts = {
  list: LIST_PROVIDER_RATE_CONTEXT,
  manual: { entries: [], manualAmountCents: "1.5500" },
  tooFew: samples(["0.2000", "0.2100", "0.2200", "0.2300"], ["0.0110", "0.0120", "0.0130"]),
  odd: samples(
    ["0.2000", "0.3000", "0.1000", "0.2500", "0.2200"],
    ["0.0120", "0.0130", "0.0110", "0.0125", "0.0140"],
  ),
  even: samples(
    ["0.2000", "0.3000", "0.1000", "0.2500", "0.2200", "0.2100"],
    ["0.0120", "0.0130", "0.0110", "0.0125", "0.0140", "0.0135"],
  ),
  // The two middle samples average inexactly in floating point.
  evenInexact: samples(
    ["0.0500", "0.0700", "0.1000", "0.2000", "0.3000", "0.4000"],
    ["0.0001", "0.0003", "0.0010", "0.0020", "0.0030", "0.0040"],
  ),
};
const pinned = (value: number | null) => (value === null ? null : Number(value.toFixed(8)));

describe("provider rate estimates", () => {
  it("keep the amounts budgets reserve", () => {
    const research = keywordResearchRate("dataforseo", "related");
    const metrics = keywordMetricsRate("dataforseo");
    const ranked = rankedKeywordPageRate("dataforseo");
    const table = Object.fromEntries(
      Object.entries(contexts).map(([name, context]) => [
        name,
        {
          rankCheck: pinned(
            estimatedRankCheckCostCents("dataforseo", DEFAULT_SERP_DEPTH, null, context),
          ),
          research100: pinned(estimatedFeatureCostCents(research, 100, false, context)),
          research100Clickstream: pinned(estimatedFeatureCostCents(research, 100, true, context)),
          metrics1000: pinned(estimatedFeatureCostCents(metrics, 1000, false, context)),
          rankedPage: pinned(estimatedFeatureCostCents(ranked, 1, false, context)),
        },
      ]),
    );
    expect(table).toMatchInlineSnapshot(`
      {
        "even": {
          "metrics1000": 13.95,
          "rankCheck": 0.215,
          "rankedPage": 0.215,
          "research100": 2.475,
          "research100Clickstream": 4.95,
        },
        "evenInexact": {
          "metrics1000": 2.7,
          "rankCheck": 0.15,
          "rankedPage": 0.15,
          "research100": 1.35,
          "research100Clickstream": 2.7,
        },
        "list": {
          "metrics1000": 13.2,
          "rankCheck": 2,
          "rankedPage": 1.212,
          "research100": 2.4,
          "research100Clickstream": 4.8,
        },
        "manual": {
          "metrics1000": 1551.2,
          "rankCheck": 1.55,
          "rankedPage": 1.55,
          "research100": 156.2,
          "research100Clickstream": 312.4,
        },
        "odd": {
          "metrics1000": 13.7,
          "rankCheck": 0.22,
          "rankedPage": 0.22,
          "research100": 2.45,
          "research100Clickstream": 4.9,
        },
        "tooFew": {
          "metrics1000": 13.2,
          "rankCheck": 2,
          "rankedPage": 1.212,
          "research100": 2.4,
          "research100Clickstream": 4.8,
        },
      }
    `);
  });
});
