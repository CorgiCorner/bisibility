import { describe, expect, it } from "vitest";
import { sortRankTrackerQualityRows } from "./rank-tracker-report-sort";
import { rankTrackerQualityFixture } from "./rank-tracker-report-test-fixture";

describe("Research metric sorting", () => {
  it("sorts actual Research values across the full result set and keeps missing values last", () => {
    const base = rankTrackerQualityFixture().row;
    const rows = [
      { ...base, id: "unknown", research: null },
      {
        ...base,
        id: "high",
        research: {
          volume: 400,
          difficulty: 20,
          cpc: 2,
          intent: "commercial" as const,
          trend: [],
          sourceSeed: "desk",
          fetchedAt: "2026-01-01T00:00:00Z",
        },
      },
      {
        ...base,
        id: "zero",
        research: {
          volume: 0,
          difficulty: 0,
          cpc: 0,
          intent: "informational" as const,
          trend: [],
          sourceSeed: "desk",
          fetchedAt: "2026-01-01T00:00:00Z",
        },
      },
    ];
    expect(
      sortRankTrackerQualityRows(rows, { field: "researchVolume", direction: "asc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["zero", "high", "unknown"]);
    expect(
      sortRankTrackerQualityRows(rows, { field: "researchCpc", direction: "desc" }).map(
        (row) => row.id,
      ),
    ).toEqual(["high", "zero", "unknown"]);
  });
});
