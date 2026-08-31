import { GSC_QUERY_STATS_PAGE_SIZE } from "@/lib/providers/analytics/gsc-query-pagination";
import {
  DEFAULT_WINDOW_ID,
  incidentsOverlapping,
  KNOWN_DATA_INCIDENTS,
  positionBandLabel,
  SEARCH_ANALYTICS_ROW_LIMIT,
  WINDOW_PRESETS,
  YEAR_OVER_YEAR,
} from "@/lib/search-insights/constants";
import { describe, expect, it } from "vitest";

describe("window presets", () => {
  it("offers the three finalized windows plus a disabled year-over-year preset", () => {
    expect(WINDOW_PRESETS.map((preset) => preset.id)).toEqual(["7", "28", "90"]);
    expect(WINDOW_PRESETS.map((preset) => preset.days)).toEqual([7, 28, 90]);
    expect(YEAR_OVER_YEAR.disabled).toBe(true);
  });

  it("defaults to the 28 day window", () => {
    expect(WINDOW_PRESETS.some((preset) => preset.id === DEFAULT_WINDOW_ID)).toBe(true);
  });

  it("keeps one definition of the request page size", () => {
    expect(SEARCH_ANALYTICS_ROW_LIMIT).toBe(GSC_QUERY_STATS_PAGE_SIZE);
  });
});

describe("thresholds", () => {
  it("labels the opportunity band numerically", () => {
    expect(positionBandLabel()).toBe("positions 4-20");
  });
});

describe("incidentsOverlapping", () => {
  const incident = KNOWN_DATA_INCIDENTS[0];

  it("reports an incident that covers the whole compared period", () => {
    expect(incidentsOverlapping("2025-09-01", "2025-09-28")).toEqual([incident]);
  });

  it("reports an incident that only clips the window edge", () => {
    expect(incidentsOverlapping("2024-12-01", incident.from)).toEqual([incident]);
    expect(incidentsOverlapping(incident.to, "2026-06-30")).toEqual([incident]);
  });

  it("stays quiet for a window entirely before or after the incident", () => {
    expect(incidentsOverlapping("2024-01-01", "2025-05-12")).toEqual([]);
    expect(incidentsOverlapping("2026-04-28", "2026-06-30")).toEqual([]);
  });
});
