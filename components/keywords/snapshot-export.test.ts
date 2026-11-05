import { expect, it } from "vitest";
import { fullResults } from "./retrieved-results-test-fixtures";
import { snapshotCsv, snapshotExportName, snapshotJson } from "./snapshot-export";

it("exports every stored row including extension ranges with CSV escaping", () => {
  const base = fullResults({
    rows: [
      {
        position: 1,
        title: 'Title, "quoted"',
        url: "https://example.org/a,b",
        domain: "example.org",
        tracked: false,
      },
    ],
  });
  const results = {
    ...base,
    extension: {
      pages: [
        {
          start: 10,
          rows: [
            {
              position: 11,
              title: "=unsafe",
              url: null,
              domain: "example.com",
              tracked: false,
              resultType: "redirect",
              resolutionStatus: "unresolved",
            },
          ],
        },
      ],
    },
  } as unknown as typeof base;
  expect(snapshotCsv(results).split("\n")).toEqual([
    "rank,title,url,domain,result_type,resolution_status",
    '1,"Title, ""quoted""","https://example.org/a,b",example.org,organic,',
    "11,'=unsafe,,example.com,redirect,unresolved",
  ]);
});
it("exports stored normalized evidence without making another request", () => {
  const results = {
    ...fullResults(),
    storedData: {
      normalization: { outcome: "no_match" },
      observationItems: [{ resultKind: "ai_overview" }],
      scope: { location: "Spain" },
    },
  };
  const data = JSON.parse(snapshotJson(results));
  expect(data.normalization).toEqual({ outcome: "no_match" });
  expect(data.observationItems).toEqual([{ resultKind: "ai_overview" }]);
  expect(data.scope).toEqual({ location: "Spain" });
  expect(data.organicResults).toHaveLength(results.rows.length);
});
it("names the file with keyword, market, device and observation date", () => {
  expect(
    snapshotExportName(
      "long keyword",
      { location: "Spain", device: "mobile" },
      fullResults(),
      "csv",
    ),
  ).toBe("long-keyword-Spain-mobile-2026-08-02.csv");
});
