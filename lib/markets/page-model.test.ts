import { describe, expect, it } from "vitest";
import { groupMarkets, type MarketsPageRow, marketMetric, sortMarkets } from "./page-model";

function market(overrides: Partial<MarketsPageRow>): MarketsPageRow {
  return {
    activeKeywordCount: 0,
    canonicalKey: "ES@es",
    countryCode: "ES",
    currentVisibility: null,
    displayName: "Malaga",
    futureKeywordDevices: ["desktop", "mobile"],
    id: "pmkt_abcdefghijklmnopqrstuvwx",
    keywordCount: 0,
    languageLabel: "Spanish",
    locationId: "location_1",
    monthlyCostCents: null,
    name: "Malaga core",
    status: "active",
    topThreeCount: null,
    ...overrides,
  };
}

describe("markets page model", () => {
  it("groups active and paused rows while excluding archived rows", () => {
    const grouped = groupMarkets([
      market({ id: "pmkt_active", status: "active" }),
      market({ id: "pmkt_paused", status: "paused" }),
      market({ id: "pmkt_removed", status: "removed" }),
    ]);

    expect(grouped.active.map((row) => row.id)).toEqual(["pmkt_active"]);
    expect(grouped.paused.map((row) => row.id)).toEqual(["pmkt_paused"]);
  });

  it("sorts null rollups last and keeps a stable public-id tie break", () => {
    const rows = [
      market({ id: "pmkt_z", name: "Same", monthlyCostCents: 150 }),
      market({ id: "pmkt_a", name: "Same", monthlyCostCents: 150 }),
      market({ id: "pmkt_null", name: "Later", monthlyCostCents: null }),
    ];

    expect(sortMarkets(rows, "monthlyCostCents").map((row) => row.id)).toEqual([
      "pmkt_a",
      "pmkt_z",
      "pmkt_null",
    ]);
  });

  it("renders unavailable rollups as a dash rather than a fabricated zero", () => {
    expect(marketMetric(null)).toBe("-");
    expect(marketMetric(0)).toBe("0");
  });
});
