import { DRAWER_LIST_CAP, DRAWER_LIST_ROWS } from "@/lib/search-insights/constants";
import { describe, expect, it } from "vitest";
import { drawerListLimit, pageSlices, perDaySeries, querySlices, statsOf } from "./detail-model";

const window = { end: "2026-07-08", start: "2026-07-04" };

describe("perDaySeries", () => {
  it("gives every day of the window an entry, a day with no rows included", () => {
    const series = perDaySeries(window, [
      {
        clicks: 4n,
        date: new Date("2026-07-04T00:00:00.000Z"),
        impressions: 40n,
        positionWeight: 0,
      },
      {
        clicks: 9n,
        date: new Date("2026-07-07T00:00:00.000Z"),
        impressions: 90n,
        positionWeight: 0,
      },
    ]);

    expect(series).toEqual([
      { clicks: 4, date: "2026-07-04" },
      { clicks: 0, date: "2026-07-05" },
      { clicks: 0, date: "2026-07-06" },
      { clicks: 9, date: "2026-07-07" },
      { clicks: 0, date: "2026-07-08" },
    ]);
  });

  it("reads a date-only column the same whether it arrives as a date or as text", () => {
    const series = perDaySeries({ end: "2026-07-04", start: "2026-07-04" }, [
      { clicks: 3n, date: "2026-07-04", impressions: 30n, positionWeight: 0 },
    ]);

    expect(series).toEqual([{ clicks: 3, date: "2026-07-04" }]);
  });
});

describe("statsOf", () => {
  it("folds the window from the same day rows the bars are drawn from", () => {
    const stats = statsOf([
      { clicks: 10n, impressions: 100n, positionWeight: 400 },
      { clicks: 30n, impressions: 300n, positionWeight: 3_000 },
    ]);

    expect(stats).toEqual({ clicks: 40, ctr: 0.1, impressions: 400, position: 8.5 });
  });

  it("reports zero rather than dividing by an empty window", () => {
    expect(statsOf([])).toEqual({ clicks: 0, ctr: 0, impressions: 0, position: 0 });
  });
});

describe("slices", () => {
  it("keeps the count the window holds, not the number of rows read", () => {
    const pages = pageSlices([
      { clicks: 12n, page: "https://example.com/guide?x=1", position: 4.2, total: 31n },
      { clicks: 5n, page: "https://example.com/blog", position: 9.1, total: 31n },
    ]);

    expect(pages.total).toBe(31);
    expect(pages.rows[0]).toEqual({
      clicks: 12,
      path: "/guide?x=1",
      position: 4.2,
      url: "https://example.com/guide?x=1",
    });
  });

  it("falls back to the rows themselves when the read carried no count", () => {
    const queries = querySlices([{ clicks: 2n, position: 6, query: "stored query" }]);

    expect(queries).toEqual({
      rows: [{ clicks: 2, position: 6, query: "stored query" }],
      total: 1,
    });
  });
});

describe("drawerListLimit", () => {
  it("opens complete at fifteen rows and never materializes more than the cap", () => {
    expect(drawerListLimit(undefined)).toBe(DRAWER_LIST_ROWS);
    expect(drawerListLimit(40)).toBe(40);
    expect(drawerListLimit(DRAWER_LIST_CAP * 9)).toBe(DRAWER_LIST_CAP);
    expect(drawerListLimit(0)).toBe(1);
  });
});
