import { describe, expect, it } from "vitest";
import { type AlertMarketRule, alertMarketMatches } from "./market-scope";

function rule(...markets: { locationId: string; status: string }[]): AlertMarketRule {
  return { markets: markets.map((projectMarket) => ({ projectMarket })) };
}

describe("alertMarketMatches", () => {
  it("preserves legacy all-markets rules with no selected market rows", () => {
    expect(alertMarketMatches(rule(), "location_us_en")).toBe(true);
  });

  it("matches only the selected active canonical market identity", () => {
    const scoped = rule(
      { locationId: "location_es_es", status: "active" },
      { locationId: "location_be_nl", status: "active" },
    );

    expect(alertMarketMatches(scoped, "location_be_nl")).toBe(true);
    expect(alertMarketMatches(scoped, "location_us_en")).toBe(false);
  });

  it("does not fire for a selected market after it is paused or removed", () => {
    expect(
      alertMarketMatches(
        rule({ locationId: "location_es_es", status: "paused" }),
        "location_es_es",
      ),
    ).toBe(false);
    expect(
      alertMarketMatches(
        rule({ locationId: "location_es_es", status: "removed" }),
        "location_es_es",
      ),
    ).toBe(false);
  });
});
