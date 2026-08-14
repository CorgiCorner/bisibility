import { describe, expect, it } from "vitest";
import {
  buildOverviewMarkets,
  type OverviewMarketKeyword,
  overviewMarketHistoryStart,
} from "./overview-markets";

const now = new Date("2026-06-28T12:00:00.000Z");

function target(
  id: string,
  locationId: string,
  displayName: string,
  languageLabel: string,
  current: number | null,
  previous: number | null,
  frequency = "daily",
): OverviewMarketKeyword {
  return {
    id,
    locationId,
    locationRef: { displayName, languageLabel },
    rankChecks: [
      {
        checkedAt: new Date("2026-06-27T12:00:00.000Z"),
        position: current,
        status: "completed",
      },
      {
        checkedAt: new Date("2026-05-20T12:00:00.000Z"),
        position: previous,
        status: "completed",
      },
    ],
    schedule: { frequency },
  };
}

describe("overview markets", () => {
  it("keeps location-language rows distinct and reconciles their active targets", () => {
    const rows = buildOverviewMarkets(
      [
        target("es-es-1", "loc_es_es", "Spain", "Spanish", 3, 18),
        target("es-es-2", "loc_es_es", "Spain", "Spanish", 14, 20),
        target("es-en-1", "loc_es_en", "Spain", "English", 16, 7),
        target("be-ar-1", "loc_be_ar", "Belgium", "Arabic", 22, 24),
        target("be-nl-1", "loc_be_nl", "Belgium", "Dutch", 2, 2, "paused"),
      ],
      { now, range: "28d" },
    );

    expect(rows).toHaveLength(3);
    expect(rows.map((row) => `${row.locationLabel} / ${row.languageLabel}`)).toEqual([
      "Spain / Spanish",
      "Spain / English",
      "Belgium / Arabic",
    ]);
    expect(rows.reduce((sum, row) => sum + row.targetCount, 0)).toBe(4);
    expect(rows[0]).toMatchObject({
      deltaPoints: 50,
      targetCount: 2,
      top10Count: 1,
      top10Share: 50,
    });
    expect(rows[1]).toMatchObject({ deltaPoints: -100, targetCount: 1, top10Count: 0 });
  });

  it("uses the effective default pause and emits accessible aggregate metadata", () => {
    const inherited = target("paused", "loc_pl_pl", "Poland", "Polish", 2, 12);
    inherited.schedule = null;
    expect(
      buildOverviewMarkets([inherited], { defaultFrequency: "paused", now, range: "28d" }),
    ).toEqual([]);

    const [row] = buildOverviewMarkets([inherited], {
      defaultFrequency: "daily",
      now,
      range: "28d",
    });
    expect(row?.trend).toHaveLength(8);
    expect(row?.top10Tooltip).toContain("out of 1 active targets");
    expect(row?.deltaTooltip).toBe("Top-10 share +100pp vs May 4 - May 31, the previous 28 days.");
    expect(row?.rangeDays).toBe(28);
  });

  it("loads an equal preceding period for every supported range", () => {
    expect(overviewMarketHistoryStart(now, "7d")).toEqual(new Date("2026-06-15T00:00:00.000Z"));
    expect(overviewMarketHistoryStart(now, "28d")).toEqual(new Date("2026-05-04T00:00:00.000Z"));
    expect(overviewMarketHistoryStart(now, "90d")).toEqual(new Date("2025-12-31T00:00:00.000Z"));
  });

  it("keeps enabled registry markets visible before their first target is added", () => {
    const rows = buildOverviewMarkets(
      [],
      [
        {
          location: { displayName: "Spain", languageLabel: "Spanish" },
          locationId: "loc_es_es",
        },
        {
          location: { displayName: "Belgium", languageLabel: "Dutch" },
          locationId: "loc_be_nl",
        },
      ],
      { now, range: "28d" },
    );

    expect(rows).toHaveLength(2);
    expect(rows[0]).toMatchObject({ locationId: "loc_es_es", targetCount: 0, top10Share: 0 });
  });

  it("keeps the sparkline endpoint aligned with the current-window headline", () => {
    const previousOnly = target("old", "loc_us_en", "United States", "English", null, 3);

    const [row] = buildOverviewMarkets([previousOnly], { now, range: "28d" });

    expect(row?.top10Share).toBe(0);
    expect(row?.trend.slice(0, -1)).toEqual(Array(7).fill(100));
    expect(row?.trend.at(-1)).toBe(row?.top10Share);
  });
});
