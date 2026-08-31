import { describe, expect, it } from "vitest";
import { exportFilename, queryExportRows } from "./query-export-model";

describe("queryExportRows", () => {
  it("derives CTR from window totals and weights position by impressions", () => {
    expect(
      queryExportRows([
        { clicks: 50n, impressions: 1000n, positionWeight: 8200, query: "rank tracker" },
      ]),
    ).toEqual([["rank tracker", 50, 1000, "0.0500", "8.20"]]);
  });

  it("never divides by zero impressions", () => {
    expect(
      queryExportRows([{ clicks: 0, impressions: 0, positionWeight: 0, query: "none" }]),
    ).toEqual([["none", 0, 0, "0.0000", "0.00"]]);
  });
});

describe("exportFilename", () => {
  it("names the file after the property and the finalized window", () => {
    expect(
      exportFilename("sc-domain:example.com", { end: "2026-07-08", start: "2026-06-11" }),
    ).toBe("search-insights-queries-example-com-2026-06-11-2026-07-08.csv");
  });

  it("says so when there is no finalized window yet", () => {
    expect(exportFilename("", null)).toBe("search-insights-queries-property-no-window.csv");
  });
});
