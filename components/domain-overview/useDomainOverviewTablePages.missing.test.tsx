import type {
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { RankedKeywordRow, RelevantPageRow } from "@/lib/providers/types";
import type { ResearchScope } from "@/lib/research/scope";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import type { DomainOverviewUiOutcome } from "./domain-overview-workspace-model";
import { domainOverviewReportFixture } from "./fixtures";
import { useDomainOverviewTablePages } from "./useDomainOverviewTablePages";

const researchScope = {
  countryCode: "US",
  countryName: "United States",
  languageCode: "en",
  languageLabel: "English",
  providerLocationCode: 2840,
  researchAvailable: true,
} satisfies ResearchScope & { providerLocationCode: number };

function failedModule(module: "keywords" | "pages"): DomainOverviewReport {
  const failure = { costCents: 0, ok: false as const, reason: "lookup_failed" as const };
  if (module === "keywords") {
    return { ...domainOverviewReportFixture, keywords: failure, state: "partial" };
  }
  return { ...domainOverviewReportFixture, pages: failure, state: "partial" };
}

function renderMissing(report: DomainOverviewReport) {
  const loadKeywordsPageAction = vi.fn<LoadDomainKeywordsPageAction>();
  const loadPagesPageAction = vi.fn<LoadDomainPagesPageAction>();
  const rendered = renderHook(() => {
    const [outcome, setOutcome] = useState<DomainOverviewUiOutcome | null>(report);
    const api = useDomainOverviewTablePages({
      activeResearchScope: researchScope,
      addSpend: vi.fn(),
      estimate: {
        cached: false,
        costCents: 4,
        freshCostCents: 6,
        historyCostCents: 12,
        keywordPageCostCents: 2,
        loading: false,
        pagePageCostCents: 3,
        valid: true,
      },
      loadKeywordsPageAction,
      loadPagesPageAction,
      projectId: "prj_1",
      report,
      setOutcome,
    });
    return { api, outcome };
  });
  return { ...rendered, loadKeywordsPageAction, loadPagesPageAction };
}

it("loads offset 0 into a missing keyword module and marks the report collected", async () => {
  const keywords = domainOverviewReportFixture.keywords;
  if (!keywords.ok) throw new Error("Keyword fixture must be available");
  const row: RankedKeywordRow = { ...keywords.data.rows[0], keyword: "loaded keyword" };
  const { result, loadKeywordsPageAction } = renderMissing(failedModule("keywords"));
  loadKeywordsPageAction.mockResolvedValue({
    cached: false,
    costCents: 2,
    data: { consumedCount: 1, costCents: 2, rows: [row], totalCount: 1 },
    fetchedAt: "2026-08-12T12:30:00.000Z",
    ok: true,
  });

  await act(async () => {
    await result.current.api.loadMore("keywords");
  });

  expect(loadKeywordsPageAction).toHaveBeenCalledWith(
    expect.objectContaining({ limit: 100, offset: 0, target: "example.com" }),
  );
  const outcome = result.current.outcome;
  if (!outcome || !("keywords" in outcome) || !outcome.keywords.ok) {
    throw new Error("Expected the keyword module to be installed");
  }
  expect(outcome.state).toBe("ok");
  expect(outcome.keywords.data.rows.map((item) => item.keyword)).toEqual(["loaded keyword"]);
});

it("loads offset 0 into a missing page module", async () => {
  const pages = domainOverviewReportFixture.pages;
  if (!pages.ok) throw new Error("Page fixture must be available");
  const row: RelevantPageRow = { ...pages.data.rows[0], path: "/loaded" };
  const { result, loadPagesPageAction } = renderMissing(failedModule("pages"));
  loadPagesPageAction.mockResolvedValue({
    cached: false,
    costCents: 3,
    data: { consumedCount: 1, costCents: 3, rows: [row], totalCount: 1 },
    fetchedAt: "2026-08-12T12:30:00.000Z",
    ok: true,
  });

  await act(async () => {
    await result.current.api.loadMore("pages");
  });

  expect(loadPagesPageAction).toHaveBeenCalledWith(expect.objectContaining({ offset: 0 }));
  const outcome = result.current.outcome;
  if (!outcome || !("pages" in outcome) || !outcome.pages.ok) {
    throw new Error("Expected the page module to be installed");
  }
  expect(outcome.state).toBe("ok");
  expect(outcome.pages.data.rows.map((item) => item.path)).toEqual(["/loaded"]);
});
