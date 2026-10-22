import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainOverviewHistoryFixture, domainOverviewReportFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({ download: vi.fn() }));

vi.mock("@/lib/ui/download", () => ({ downloadTextFile: mocks.download }));

import {
  domainOverviewKeywordsCsv,
  domainOverviewPagesCsv,
  domainOverviewSummaryCsv,
  downloadDomainOverviewPages,
  downloadDomainOverviewSummary,
} from "./domain-overview-table-export";

function summaryInput(
  overrides: Partial<Parameters<typeof domainOverviewSummaryCsv>[0]> = {},
): Parameters<typeof domainOverviewSummaryCsv>[0] {
  const overview = domainOverviewReportFixture.overview;
  if (!overview) throw new Error("Overview fixture must be available");
  return {
    countryCode: "US",
    fetchedAt: domainOverviewReportFixture.fetchedAt,
    history: null,
    languageCode: domainOverviewReportFixture.languageCode,
    locationCode: domainOverviewReportFixture.locationCode,
    overview,
    previousOverview: domainOverviewReportFixture.previousOverview,
    provider: domainOverviewReportFixture.provider,
    scope: domainOverviewReportFixture.scope,
    sourceSnapshotAt: domainOverviewReportFixture.sourceSnapshotAt,
    target: domainOverviewReportFixture.target,
    ...overrides,
  };
}

describe("Domain Overview table export", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exports only sourced page fields and preserves zero and missing metrics", () => {
    expect(
      domainOverviewPagesCsv([
        {
          path: "/a,b",
          etv: 0,
          keywordCount: null,
          topKeyword: "legacy",
          topKeywordPosition: 1,
          etvDeltaPct: 3,
        },
      ]),
    ).toBe('page,estimated_traffic,keywords\n"/a,b",0,');
  });

  it("exports every fetched page through the shared CSV downloader", () => {
    const pages = domainOverviewReportFixture.pages;
    if (!pages.ok) throw new Error("Pages fixture must be available");

    downloadDomainOverviewPages(pages.data.rows);

    expect(mocks.download).toHaveBeenCalledWith(
      domainOverviewPagesCsv(pages.data.rows),
      "domain-overview-pages.csv",
      "text/csv;charset=utf-8",
    );
    expect(domainOverviewPagesCsv(pages.data.rows).split("\n")).toHaveLength(101);
  });

  it("quotes keyword fields that contain CSV delimiters", () => {
    const keywords = domainOverviewReportFixture.keywords;
    if (!keywords.ok) throw new Error("Keyword fixture must be available");
    const csv = domainOverviewKeywordsCsv([
      { ...keywords.data.rows[0], keyword: 'desk, "wide"', rankingUrl: "https://example.com/a,b" },
    ]);

    expect(csv).toContain('"desk, ""wide"""');
    expect(csv).toContain('"https://example.com/a,b"');
  });

  it("neutralizes spreadsheet formulas in provider-sourced text", () => {
    const keywords = domainOverviewReportFixture.keywords;
    if (!keywords.ok) throw new Error("Keyword fixture must be available");
    const csv = domainOverviewKeywordsCsv([
      { ...keywords.data.rows[0], keyword: '=HYPERLINK("https://example.test")' },
    ]);

    expect(csv).toContain('"\'=HYPERLINK(""https://example.test"")"');
  });

  it("writes context, KPIs, distribution, and changes without unloaded history", () => {
    const csv = domainOverviewSummaryCsv(summaryInput());

    expect(csv.startsWith("section,metric,period,value,unit\n")).toBe(true);
    expect(csv).toContain("context,target,,example.com,");
    expect(csv).toContain("context,scope,,root,");
    expect(csv).toContain("context,country,,US,");
    expect(csv).toContain("context,language,,en,");
    expect(csv).toContain("context,provider,,dataforseo,");
    expect(csv).toContain("context,fetched_at,,2026-08-12T12:00:00.000Z,");
    expect(csv).toContain("context,source_snapshot_at,,2026-08-12T00:00:00.000Z,");
    expect(csv).toContain("kpi,estimated_traffic,current,48200,etv");
    expect(csv).toContain("kpi,estimated_traffic,previous,45300,etv");
    expect(csv).toContain("kpi,estimated_traffic,change,0.064018,ratio");
    expect(csv).toContain("kpi,organic_keywords,current,12940,keywords");
    expect(csv).toContain("kpi,organic_keywords,previous,12528,keywords");
    expect(csv).toContain("kpi,organic_keywords,change,412,keywords");
    expect(csv).toContain("kpi,top_10,current,386,keywords");
    expect(csv).toContain("kpi,top_10,previous,380,keywords");
    expect(csv).toContain("kpi,top_10,change,6,keywords");
    expect(csv).toContain("kpi,estimated_value,current,61300,usd");
    expect(csv).toContain("kpi,estimated_value,change,0,ratio");
    expect(csv).toContain("kpi,position_1,current,84,keywords");
    expect(csv).toContain("kpi,position_1,previous,78,keywords");
    expect(csv).toContain("kpi,position_1,change,6,keywords");
    expect(csv).toContain("kpi,new_keywords,current,412,keywords");
    expect(csv).toContain("kpi,lost_keywords,current,39,keywords");
    expect(csv).toContain("position_distribution,pos_1,current,84,keywords");
    expect(csv).toContain("position_distribution,pos_1,share,0.006491,ratio");
    expect(csv).toContain("position_distribution,pos_21_50,current,3610,keywords");
    expect(csv).toContain("position_distribution,pos_51_100,current,8230,keywords");
    expect(csv).toContain("what_changed,new,current,412,keywords");
    expect(csv).toContain("what_changed,lost,current,39,keywords");
    expect(csv).toContain("what_changed,up,current,263,keywords");
    expect(csv).toContain("what_changed,down,current,84,keywords");
    expect(csv).not.toContain("12,940");
    expect(csv.split("\n").some((line) => line.startsWith("history,"))).toBe(false);
  });

  it("omits previous and change rows when the report has no earlier overview", () => {
    const csv = domainOverviewSummaryCsv(summaryInput({ previousOverview: null }));

    expect(csv).toContain("kpi,estimated_traffic,current,48200,etv");
    expect(csv).not.toContain(",previous,");
    expect(csv).not.toContain(",change,");
  });

  it("adds one raw row per loaded month and metric, in calendar order", () => {
    const csv = domainOverviewSummaryCsv(
      summaryInput({ history: [...domainOverviewHistoryFixture].reverse() }),
    );
    const history = csv.split("\n").filter((line) => line.startsWith("history,"));

    expect(history).toHaveLength(domainOverviewHistoryFixture.length * 4);
    expect(history[0]).toBe("history,traffic,2025-08-01,34000,etv");
    expect(history).toContain("history,keywords,2025-08-01,9800,keywords");
    expect(history).toContain("history,top_10,2025-08-01,280,keywords");
    expect(history).toContain("history,value,2025-08-01,42000,usd");
  });

  it("quotes a domain containing a comma or quote and sanitizes the file name", () => {
    downloadDomainOverviewSummary(summaryInput({ target: 'example.com, "west"' }));

    expect(mocks.download).toHaveBeenCalledWith(
      expect.stringContaining('"example.com, ""west"""'),
      "domain-overview-example.com-west-root-2026-08-12.csv",
      "text/csv;charset=utf-8",
    );
  });
});
