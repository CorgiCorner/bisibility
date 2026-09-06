import { projectLevelContext } from "@/lib/markets/market-context-value";
import { asMarketRef } from "@/lib/routing/app-path";
import { describe, expect, it } from "vitest";
import {
  marketRunPartition,
  marketScopeLabel,
  resolveMarketScope,
  scopedRunActionLabel,
} from "./market-scope";

const markets = [
  {
    canonicalKey: "DE",
    displayName: "Germany",
    id: "pmkt_de",
    languageLabel: "German",
  },
  {
    canonicalKey: "US",
    displayName: "United States",
    id: "pmkt_us",
    languageLabel: "English",
  },
];

function marketContext(ref: string) {
  return { market: { locationId: "loc_de", ref: asMarketRef(ref) }, projectRef: "prj_1" };
}

function row(id: string, canonicalKey: string) {
  return { id, location: { canonicalKey } };
}

describe("resolveMarketScope", () => {
  it("names the market the URL stands in", () => {
    expect(resolveMarketScope(marketContext("pmkt_de"), markets)).toEqual({
      canonicalKey: "DE",
      label: "Germany / German",
      ref: "pmkt_de",
    });
  });

  it("stays at the project level when the URL carries no market", () => {
    expect(resolveMarketScope(projectLevelContext("prj_1"), markets)).toBeNull();
  });

  it("refuses to invent a name for a market it cannot resolve", () => {
    expect(resolveMarketScope(marketContext("pmkt_de"), undefined)).toBeNull();
    expect(resolveMarketScope(marketContext("pmkt_missing"), markets)).toBeNull();
  });

  it("falls back to the location alone when the market has no language label", () => {
    expect(marketScopeLabel({ displayName: "Germany", languageLabel: "" })).toBe("Germany");
    expect(marketScopeLabel({ displayName: "Germany", languageLabel: "German" })).toBe(
      "Germany / German",
    );
  });
});

describe("marketRunPartition", () => {
  const scope = { canonicalKey: "DE", label: "Germany / German", ref: "pmkt_de" };

  it("keeps every row in scope at the project level", () => {
    expect(marketRunPartition([row("kw_1", "DE"), row("kw_2", "US")], null)).toEqual({
      crossMarketIds: null,
      inMarketIds: ["kw_1", "kw_2"],
    });
  });

  it("splits a selection that reaches past the market it is standing in", () => {
    expect(marketRunPartition([row("kw_1", "DE"), row("kw_2", "US")], scope)).toEqual({
      crossMarketIds: ["kw_1", "kw_2"],
      inMarketIds: ["kw_1"],
    });
  });

  it("offers no cross-market action when nothing lies outside the market", () => {
    expect(marketRunPartition([row("kw_1", "DE")], scope)).toEqual({
      crossMarketIds: null,
      inMarketIds: ["kw_1"],
    });
  });
});

describe("scopedRunActionLabel", () => {
  it("leaves the project-level label alone", () => {
    expect(scopedRunActionLabel("Run checks", null)).toBe("Run checks");
  });

  it("names the market the spend lands in", () => {
    expect(
      scopedRunActionLabel("Run checks", {
        canonicalKey: "DE",
        label: "Germany / German",
        ref: "pmkt_de",
      }),
    ).toBe("Run checks in Germany / German");
  });
});
