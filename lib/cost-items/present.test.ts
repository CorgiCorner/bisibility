import { describe, expect, it } from "vitest";
import { presentUsageCosts, type StoredCostItem } from "./present";

function item(patch: Partial<StoredCostItem> = {}): StoredCostItem {
  return {
    amountMinor: 100,
    billing: "monthly",
    catalogKey: null,
    currency: "USD",
    endedOn: null,
    kind: "custom",
    name: "Notes",
    planLabel: "",
    priceChanges: [],
    projects: [
      { basisPoints: null, id: "b", name: "Other", publicId: "prj_b" },
      { basisPoints: null, id: "a", name: "Current", publicId: "prj_a" },
    ],
    publicId: "cst_present",
    split: "equal",
    startedOn: "2026-01-01",
    ...patch,
  };
}

describe("usage cost presentation", () => {
  it("splits a stored item and keeps currencies apart from provider spend", () => {
    const view = presentUsageCosts({
      items: [
        item(),
        item({
          amountMinor: 2_000,
          billing: "one_off",
          currency: "EUR",
          name: "Brief",
          publicId: "cst_once",
          startedOn: "2026-11-02",
        }),
        item({ name: "Next year", publicId: "cst_future", startedOn: "2027-01-01" }),
      ],
      month: "2026-11",
      projectId: "a",
      providerMinor: 125,
      today: "2026-11-10",
    });
    expect(view.rows.map((row) => row.projectShareMinor)).toEqual([50, 1_000]);
    expect(
      view.rows.reduce((sum, row) => sum + (row.currency === "USD" ? row.projectShareMinor : 0), 0),
    ).toBe(50);
    expect(view.tiles.seo).toEqual([
      { currency: "USD", minor: 175 },
      { currency: "EUR", minor: 1_000 },
    ]);
    expect(view.tiles.provider).toEqual([{ currency: "USD", minor: 125 }]);
    expect(view.tiles.custom).toEqual([{ currency: "EUR", minor: 1_000 }]);
    expect(view.tiles.subscriptions).toEqual([{ currency: "USD", minor: 50 }]);
  });

  it("shows no amount when nothing was entered", () => {
    const view = presentUsageCosts({
      items: [],
      month: "2026-11",
      projectId: "a",
      providerMinor: 0,
      today: "2026-11-10",
    });
    expect(view.tiles).toEqual({ custom: [], provider: [], seo: [], subscriptions: [] });
  });
});
