import { describe, expect, it } from "vitest";
import { ruleMarketScopeLabel } from "./NewRuleMarketFields";

const markets = [
  { canonicalKey: "ES@es", id: "pmkt_malaga", label: "Malaga core" },
  { canonicalKey: "PL@pl", id: "pmkt_warsaw", label: "Warsaw core" },
];

describe("ruleMarketScopeLabel", () => {
  const messages = {
    allMarkets: "All markets",
    marketCount: (count: number) => `${count} markets`,
  };

  it("keeps rule membership independent and describes all, one, and many markets", () => {
    expect(ruleMarketScopeLabel([], markets, messages)).toBe("All markets");
    expect(ruleMarketScopeLabel(["pmkt_malaga"], markets, messages)).toBe("Malaga core");
    expect(ruleMarketScopeLabel(["pmkt_malaga", "pmkt_warsaw"], markets, messages)).toBe(
      "2 markets",
    );
  });
});
