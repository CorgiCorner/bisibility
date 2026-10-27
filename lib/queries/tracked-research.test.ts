import { describe, expect, it, vi } from "vitest";
import { rankTrackerQualityFixture } from "./rank-tracker-report-test-fixture";
import { loadTrackedResearch } from "./tracked-research";

vi.mock("server-only", () => ({}));
describe("tracked Research database read", () => {
  it("uses the authorized project and as-of time, returning only the matching market and language", async () => {
    const row = rankTrackerQualityFixture().row;
    const queryRaw = vi.fn(async (_query: unknown) => [
      {
        countryCode: "PL",
        languageCode: "pl",
        seed: "service",
        fetchedAt: new Date("2026-01-02T00:00:00Z"),
        row: {
          keyword: row.keyword,
          searchVolume: 0,
          difficulty: 30,
          cpcCents: 50,
          intent: "commercial",
          monthlyTrend: [],
        },
      },
    ]);
    const asOf = new Date("2026-01-03T00:00:00Z");
    const result = await loadTrackedResearch(
      { $queryRaw: queryRaw } as never,
      "project_1",
      [row],
      asOf,
    );
    expect(result.get(row.id)).toMatchObject({ volume: 0, cpc: 0.5, sourceSeed: "service" });
    const sql = queryRaw.mock.calls[0][0] as { values: unknown[] };
    expect(sql.values).toContain("project_1");
    expect(sql.values).toContain(asOf);
    expect(sql.values).toContain(row.keyword.toLowerCase());
  });
  it("returns an empty map without querying when no targets are present", async () => {
    const queryRaw = vi.fn();
    expect(
      (await loadTrackedResearch({ $queryRaw: queryRaw } as never, "project_1", [], new Date()))
        .size,
    ).toBe(0);
    expect(queryRaw).not.toHaveBeenCalled();
  });
  it("propagates read errors instead of rendering missing data as a successful empty result", async () => {
    await expect(
      loadTrackedResearch(
        { $queryRaw: vi.fn().mockRejectedValue(new Error("database unavailable")) } as never,
        "project_1",
        [rankTrackerQualityFixture().row],
        new Date(),
      ),
    ).rejects.toThrow("database unavailable");
  });
});
