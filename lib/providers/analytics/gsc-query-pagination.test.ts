import { describe, expect, it, vi } from "vitest";
import {
  fetchGscQueryStats,
  gscDimensionFilterGroups,
  gscQueryDimensions,
} from "./gsc-query-pagination";

const range = { endDate: "2026-07-03", startDate: "2026-07-01" };

describe("search analytics query dimensions", () => {
  it("orders a deduplicated subset and forces page when a page path is set", () => {
    expect(
      gscQueryDimensions({
        ...range,
        dimensions: ["device", "query", "device", "country"],
      }),
    ).toEqual(["query", "country", "device"]);

    expect(
      gscQueryDimensions({
        ...range,
        dimensions: ["query", "country"],
        pagePath: { match: "contains", value: "/docs" },
      }),
    ).toEqual(["query", "page", "country"]);

    expect(gscQueryDimensions(range)).toEqual(["query"]);
    expect(
      gscQueryDimensions({
        ...range,
        pagePath: { match: "prefix", value: "/blog" },
      }),
    ).toEqual(["query", "page"]);
  });

  it("combines country and device filters with query and page filters", () => {
    expect(
      gscDimensionFilterGroups({
        ...range,
        country: "USA",
        device: "mobile",
        pagePath: { match: "contains", value: "/docs/" },
        query: "seo api",
        queryMatch: "contains",
      }),
    ).toEqual({
      dimensionFilterGroups: [
        {
          filters: [
            { dimension: "query", expression: "seo api", operator: "contains" },
            { dimension: "page", expression: "/docs/", operator: "contains" },
            { dimension: "country", expression: "usa", operator: "equals" },
            { dimension: "device", expression: "MOBILE", operator: "equals" },
          ],
        },
      ],
    });
  });

  it("passes offset through as startRow", async () => {
    const fetchPage = vi.fn(async () => []);

    await fetchGscQueryStats({ apiKey: "token" }, { ...range, limit: 25, offset: 50 }, fetchPage);
    expect(fetchPage).toHaveBeenLastCalledWith(
      expect.objectContaining({
        dimensions: ["query"],
        rowLimit: 25,
        startRow: 50,
      }),
    );

    await fetchGscQueryStats({ apiKey: "token" }, { ...range, limit: 25, offset: 0 }, fetchPage);
    expect(fetchPage).toHaveBeenLastCalledWith(expect.objectContaining({ startRow: 0 }));
  });
});
