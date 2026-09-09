import type { RetrievedResults } from "@/lib/checks/contract";
import { describe, expect, it } from "vitest";
import { summarizeOverviewCompetitors } from "./overview-comparison";
import {
  buildSerpComparison,
  type CompetitorPolicy,
  competitorAppliesToMarket,
  matchingCompetitor,
} from "./serp-comparison";

const competitor: CompetitorPolicy = {
  domain: "docs.rival.test",
  label: "Rival",
  publicId: "cmp_rival",
  scopePolicy: "all_markets",
  marketOverrides: [],
};
const result: RetrievedResults = {
  tier: "compact",
  checkId: "chk_1",
  checkedAt: "2026-09-08T00:00:00Z",
  provider: "test",
  providerLabel: "Test",
  expiredAt: null,
  domains: [
    { domain: "rival.test", bestPosition: 1 },
    { domain: "docs.rival.test", bestPosition: 4 },
    { domain: "en.docs.rival.test", bestPosition: 2 },
    { domain: "mine.test", bestPosition: 5 },
  ],
};

describe("contextual competitor comparison", () => {
  it("respects an explicit docs host, picks its best rank and compares the same check", () => {
    const rows = buildSerpComparison(result, [competitor], "https://www.mine.test");
    expect(rows[0]).toMatchObject({ position: 5 });
    expect(rows[1]).toMatchObject({ position: 2, gap: -3 });
    expect(matchingCompetitor("rival.test", [competitor])).toBeUndefined();
    expect(matchingCompetitor("docs.rival.test", [competitor])).toBe(competitor);
  });

  it("does not assign a loss or a rank when a competitor is absent from a partial snapshot", () => {
    const rows = buildSerpComparison(
      { ...result, domains: [{ domain: "mine.test", bestPosition: 1 }] },
      [competitor],
      "mine.test",
    );
    expect(rows[1]).toMatchObject({ position: null, gap: null });
    expect(buildSerpComparison({ ...result, tier: "none" }, [competitor], "mine.test")).toEqual([]);
  });

  it("honors both inclusion and exclusion policies", () => {
    const overrides = [{ mode: "excluded" as const, projectMarket: { locationId: "us" } }];
    expect(competitorAppliesToMarket({ ...competitor, marketOverrides: overrides }, "us")).toBe(
      false,
    );
    expect(competitorAppliesToMarket({ ...competitor, marketOverrides: overrides }, "pl")).toBe(
      true,
    );
    expect(
      competitorAppliesToMarket(
        { ...competitor, scopePolicy: "selected_markets", marketOverrides: [] },
        "pl",
      ),
    ).toBe(false);
    expect(
      competitorAppliesToMarket(
        {
          ...competitor,
          scopePolicy: "selected_markets",
          marketOverrides: [{ mode: "added", projectMarket: { locationId: "pl" } }],
        },
        "pl",
      ),
    ).toBe(true);
  });

  it("aggregates paired results only, and keeps absent and unrecorded results distinct", () => {
    const [row] = summarizeOverviewCompetitors(
      [competitor],
      [
        {
          locationId: "us",
          ownPosition: 5,
          ranks: [
            { domain: "docs.rival.test", position: 2 },
            { domain: "docs.rival.test", position: 4 },
          ],
        },
        { locationId: "us", ownPosition: 1, ranks: [{ domain: "docs.rival.test", position: 6 }] },
        {
          locationId: "us",
          ownPosition: null,
          ranks: [{ domain: "docs.rival.test", position: 1 }],
        },
        { locationId: "us", ownPosition: 1, ranks: [] },
        { locationId: "us", ownPosition: 1, ranks: null },
      ],
    );
    expect(row).toMatchObject({ found: 3, checked: 4, above: 1, paired: 2, averagePosition: 3 });
  });

  it("excludes an unselected market from every dashboard denominator", () => {
    const [row] = summarizeOverviewCompetitors(
      [
        {
          ...competitor,
          marketOverrides: [{ mode: "excluded", projectMarket: { locationId: "pl" } }],
        },
      ],
      [
        { locationId: "us", ownPosition: 5, ranks: [{ domain: "docs.rival.test", position: 2 }] },
        { locationId: "pl", ownPosition: 10, ranks: [{ domain: "docs.rival.test", position: 1 }] },
      ],
    );
    expect(row).toMatchObject({ checked: 1, found: 1, above: 1, paired: 1, averagePosition: 2 });
  });
});
