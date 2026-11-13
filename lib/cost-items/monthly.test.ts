import { describe, expect, it } from "vitest";
import { itemMonthlyMinor, type MonthlyCostItem, projectMonthlyMinor, splitMinor } from "./monthly";

function item(patch: Partial<MonthlyCostItem> = {}): MonthlyCostItem {
  return {
    amountMinor: 12_000,
    billing: "monthly",
    endedOn: null,
    priceChanges: [],
    projects: [
      { basisPoints: null, projectId: "b" },
      { basisPoints: null, projectId: "a" },
    ],
    split: "equal",
    startedOn: "2026-01-01",
    ...patch,
  };
}

describe("item monthly cost", () => {
  it("keeps a full month, divides yearly by 12, and spreads lifetime over 36 months", () => {
    expect(itemMonthlyMinor(item(), "2026-06")).toBe(12_000);
    expect(itemMonthlyMinor(item({ billing: "yearly", amountMinor: 12_000 }), "2026-06")).toBe(
      1_000,
    );
    expect(itemMonthlyMinor(item({ billing: "yearly", amountMinor: 100 }), "2026-06")).toBe(8);
    expect(itemMonthlyMinor(item({ amountMinor: 3600, billing: "lifetime" }), "2026-01")).toBe(100);
    expect(itemMonthlyMinor(item({ amountMinor: 3600, billing: "lifetime" }), "2028-12")).toBe(100);
    expect(itemMonthlyMinor(item({ amountMinor: 3600, billing: "lifetime" }), "2029-01")).toBe(0);
  });

  it("prorates a mid-month start and a price change by day", () => {
    expect(itemMonthlyMinor(item({ startedOn: "2026-11-16" }), "2026-11")).toBe(6_000);
    expect(
      itemMonthlyMinor(
        item({
          priceChanges: [
            { amountMinor: 0, effectiveFrom: "2026-11-01", reason: "trial" },
            { amountMinor: 12_000, effectiveFrom: "2026-11-11", reason: "regular" },
          ],
        }),
        "2026-11",
      ),
    ).toBe(8_000);
  });

  it("lands a one-off in full during its start month only", () => {
    const once = item({
      amountMinor: 3_650,
      billing: "one_off",
      startedOn: "2026-11-23",
    });
    expect(itemMonthlyMinor(once, "2026-11")).toBe(3_650);
    expect(itemMonthlyMinor(once, "2026-12")).toBe(0);
    expect(
      itemMonthlyMinor(
        item({
          ...once,
          priceChanges: [{ amountMinor: 0, effectiveFrom: "2026-11-01", reason: "trial" }],
        }),
        "2026-11",
      ),
    ).toBe(0);
  });

  it("stops after endedOn and ignores days before the start", () => {
    expect(itemMonthlyMinor(item({ endedOn: "2026-11-15" }), "2026-11")).toBe(6_000);
    expect(itemMonthlyMinor(item({ endedOn: "2026-10-31" }), "2026-11")).toBe(0);
  });
});

describe("project split", () => {
  it("assigns the equal remainder to the lowest project ids so the parts sum", () => {
    expect(splitMinor(100, "equal", item().projects)).toEqual([
      { minor: 50, projectId: "a" },
      { minor: 50, projectId: "b" },
    ]);
    expect(
      splitMinor(100, "equal", [
        { basisPoints: null, projectId: "c" },
        { basisPoints: null, projectId: "a" },
        { basisPoints: null, projectId: "b" },
      ]),
    ).toEqual([
      { minor: 34, projectId: "a" },
      { minor: 33, projectId: "b" },
      { minor: 33, projectId: "c" },
    ]);
  });

  it("splits percent by basis points and keeps the parts equal to the whole", () => {
    const projects = [
      { basisPoints: 5_000, projectId: "b" },
      { basisPoints: 5_000, projectId: "a" },
    ];
    const parts = splitMinor(101, "percent", projects);
    expect(parts).toEqual([
      { minor: 51, projectId: "a" },
      { minor: 50, projectId: "b" },
    ]);
    expect(parts.reduce((sum, part) => sum + part.minor, 0)).toBe(101);
    expect(projectMonthlyMinor(item({ projects, split: "percent" }), "a", "2026-06")).toBe(6_000);
  });

  it("keeps a partial percent and leaves the rest unattributed", () => {
    expect(splitMinor(9_900, "percent", [{ basisPoints: 5_000, projectId: "a" }])).toEqual([
      { minor: 4_950, projectId: "a" },
    ]);
    expect(splitMinor(3, "percent", [{ basisPoints: 5_000, projectId: "a" }])).toEqual([
      { minor: 2, projectId: "a" },
    ]);
  });

  it("gives a single project the whole monthly amount", () => {
    expect(
      projectMonthlyMinor(
        item({ projects: [{ basisPoints: null, projectId: "only" }], split: "single_project" }),
        "only",
        "2026-06",
      ),
    ).toBe(12_000);
    expect(
      projectMonthlyMinor(
        item({ projects: [{ basisPoints: null, projectId: "only" }], split: "single_project" }),
        "other",
        "2026-06",
      ),
    ).toBe(0);
  });
});
