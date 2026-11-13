import { describe, expect, it } from "vitest";
import { itemMonthlyMinor } from "./monthly";
import { activePriceNote, buildPriceChanges, scheduleSegments } from "./schedule";
import { costTiles } from "./tiles";

describe("price schedule", () => {
  const draft = {
    amountMinor: 13_995,
    discount: { amountMinor: null, mode: "percent" as const, months: 3, percent: 50, until: null },
    startedOn: "2026-11-23",
    trialUntil: "2026-11-30",
  };

  it("stores a trial, then a discount, then the regular amount", () => {
    const changes = buildPriceChanges(draft);
    expect(changes.map((change) => change.reason)).toEqual(["trial", "discount", "regular"]);
    expect(changes[1]?.amountMinor).toBe(6_998);
    expect(
      scheduleSegments(draft.amountMinor, draft.startedOn, changes).map((segment) => segment.until),
    ).toEqual(["2026-11-30", "2027-02-28", null]);
    expect(activePriceNote(draft.amountMinor, changes, "2026-11-25")).toEqual({
      trial: true,
      until: "2026-11-30",
    });
    const note = activePriceNote(draft.amountMinor, changes, "2026-12-15");
    expect(note && "percent" in note ? note.percent : null).toBe(50);
  });

  it("uses the same monthly total the stored changes describe", () => {
    const changes = buildPriceChanges(draft);
    const item = {
      amountMinor: draft.amountMinor,
      billing: "monthly" as const,
      endedOn: null,
      priceChanges: changes,
      projects: [],
      split: "single_project" as const,
      startedOn: draft.startedOn,
    };
    expect(itemMonthlyMinor(item, "2026-11")).toBe(0);
    expect(itemMonthlyMinor(item, "2026-12")).toBe(6_998);
  });
});

describe("cost tiles", () => {
  it("keeps currencies apart and adds provider operations only to their currency", () => {
    const tiles = costTiles(
      [
        { billing: "monthly", currency: "EUR", shareMinor: 2_000 },
        { billing: "one_off", currency: "USD", shareMinor: 500 },
      ],
      { currency: "USD", minor: 125 },
    );
    expect(tiles.seo).toEqual([
      { currency: "USD", minor: 625 },
      { currency: "EUR", minor: 2_000 },
    ]);
    expect(tiles.provider).toEqual([{ currency: "USD", minor: 125 }]);
    expect(tiles.subscriptions).toEqual([{ currency: "EUR", minor: 2_000 }]);
    expect(tiles.custom).toEqual([{ currency: "USD", minor: 500 }]);
    expect(costTiles([], null).subscriptions).toEqual([]);
  });
});
