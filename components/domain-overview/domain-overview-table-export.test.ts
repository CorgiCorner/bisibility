import { beforeEach, describe, expect, it, vi } from "vitest";
import { domainOverviewReportFixture } from "./fixtures";

const mocks = vi.hoisted(() => ({ download: vi.fn() }));

vi.mock("@/lib/ui/download", () => ({ downloadTextFile: mocks.download }));

import {
  domainOverviewKeywordsCsv,
  domainOverviewPagesCsv,
  downloadDomainOverviewPages,
} from "./domain-overview-table-export";

describe("Domain Overview table export", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
