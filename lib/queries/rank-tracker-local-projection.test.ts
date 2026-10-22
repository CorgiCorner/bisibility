import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { describe, expect, it } from "vitest";
import { filterRankTrackerLocalRows } from "./rank-tracker-local-projection";
import { localListFixture } from "./rank-tracker-local-test-fixture";

describe("Local list shared quality projection", () => {
  it("keeps whole-scope denominators, positive business slots and unknown evidence, never organic position", () => {
    const f = localListFixture(),
      query = structuredClone(defaultRankTrackerQueryState);
    const projected = filterRankTrackerLocalRows(f.organic, f.report, query, f.policy);
    expect(projected.filtered.expected).toBe(60);
    expect(projected.filtered.retainedChecks).toBe(60);
    expect(projected.filtered.targetTop3.counts.ranked).toBe(48);
    expect(projected.filtered.targetTop3.counts.unknown).toBe(12);
    expect(projected.filtered.targetTop3.delta).toBeNull();
    expect(projected.facts.find((fact) => fact.keywordId === "target-1")?.target).toMatchObject({
      evidence: "positive",
      position: 2,
    });
    expect(projected.facts.find((fact) => fact.keywordId === "target-0")?.target?.evidence).toBe(
      "unknown",
    );
    expect(
      projected.rows.every(
        (row) =>
          row.hasRankData === false &&
          row.rankingUrl === null &&
          row.sparkline.length === 0 &&
          row.positionHistory.length === 0 &&
          row.serpFeatures.length === 0,
      ),
    ).toBe(true);
    expect(projected.rows.some((row) => "rankQuality" in row)).toBe(false);
    expect(JSON.stringify(projected.facts)).not.toContain("configuredScope");
    expect(JSON.stringify(projected.facts)).not.toContain("organic-only");
  });
  it("applies rank filters and sorting to Local proof while counts stay independent of page/grouping", () => {
    const f = localListFixture();
    const query = {
      ...structuredClone(defaultRankTrackerQueryState),
      filters: { ...defaultRankTrackerQueryState.filters, position: ["top3" as const] },
      sort: { direction: "asc" as const, field: "position" as const },
    };
    const flat = filterRankTrackerLocalRows(f.organic, f.report, query, f.policy);
    const grouped = filterRankTrackerLocalRows(
      f.organic,
      f.report,
      { ...query, grouped: true, page: 3 },
      f.policy,
    );
    expect(flat.filtered.expected).toBe(48);
    expect(flat.filtered.retainedChecks).toBe(48);
    expect(grouped.filtered.targetTop3).toEqual(flat.filtered.targetTop3);
    expect(grouped.groups).toHaveLength(1);
    expect(grouped.groups[0].subRows).toHaveLength(48);
    expect(flat.facets.positions.find((value) => value.id === "top3")?.count).toBe(48);
    expect(flat.facts.find((fact) => fact.keywordId === flat.rows[0].id)?.target?.position).toBe(1);
  });
  it("does not widen unsupported organic filters, leak URL search or invent missing retained check counts", () => {
    const f = localListFixture(6),
      query = structuredClone(defaultRankTrackerQueryState);
    const invalid = filterRankTrackerLocalRows(
      f.organic,
      f.report,
      { ...query, filters: { ...query.filters, wrongUrl: true } },
      f.policy,
    );
    expect(invalid.unsupportedFilters).toBe(true);
    expect(invalid.filtered.expected).toBe(0);
    expect(
      filterRankTrackerLocalRows(
        f.organic,
        f.report,
        { ...query, search: "organic-only" },
        f.policy,
      ).rows,
    ).toHaveLength(0);
    const badRows = f.report.rows.map(({ retainedChecks: _count, ...row }) => row);
    expect(() =>
      filterRankTrackerLocalRows(f.organic, { ...f.report, rows: badRows }, query, f.policy),
    ).toThrow();
  });
});
