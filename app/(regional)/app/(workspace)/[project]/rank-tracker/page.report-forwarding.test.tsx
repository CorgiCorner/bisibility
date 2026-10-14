import { defaultRankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import { presentReportSummary } from "@/lib/rank-reports/presentation";
import { redirect } from "@/tests/next-navigation";
import {
  captured,
  getPageMocks,
  getPageReportOptions,
  renderPage,
  setupPageTest,
} from "@/tests/rank-tracker-page";
import { pageFlatList, pageView } from "@/tests/rank-tracker-page-fixtures";
import { pageKernelSelection } from "@/tests/rank-tracker-page-report-fixtures";
import { beforeEach, describe, expect, it } from "vitest";

const mocks = getPageMocks();
beforeEach(setupPageTest);
describe("whole report and row quality forwarding through the RSC page", () => {
  it("forwards the shared-kernel whole summary and current/last-known distinction independently of one visible row", async () => {
    const fixture = pageKernelSelection(defaultRankTrackerQueryState);
    mocks.getRankTrackerKeywordList.mockResolvedValue(fixture.flat);
    await renderPage({});
    expect(fixture.rows).toHaveLength(2);
    expect(fixture.flat.rows).toHaveLength(1);
    expect(fixture.summary.metric.counts.expected).toBe(2);
    expect(captured.gridProps.report).toEqual(presentReportSummary(fixture.summary));
    expect(captured.gridProps.report).not.toHaveProperty("metric.contributions");
    expect(captured.gridProps.report).not.toHaveProperty("metric.exclusions");
    expect(captured.gridProps.rows).toBe(fixture.flat.rows);
    expect(captured.gridProps.matchedTargetCount).toBe(2);
    expect(fixture.rows[1]?.rankQuality).toMatchObject({
      currentScopeState: "unavailable",
      currentScopeReason: "current_scope_unavailable",
      lastKnown: { current: { evidence: "positive", position: 2 } },
    });
    expect(mocks.getRankTrackerKeywordList.mock.calls[0]?.[1]).toBe(getPageReportOptions());
  });

  it("forwards a grouped whole report instead of substituting its first visible group", async () => {
    mocks.getProjectMarkets.mockResolvedValue({
      markets: [
        { id: "pmkt_a", status: "active" },
        { id: "pmkt_b", status: "active" },
      ],
    });
    const fixture = pageKernelSelection(defaultRankTrackerQueryState);
    mocks.getRankTrackerGroupedList.mockResolvedValue(fixture.grouped);
    await renderPage({});
    expect(fixture.groups).toHaveLength(2);
    expect(fixture.grouped.groups).toHaveLength(1);
    expect(captured.gridProps.report).toEqual(presentReportSummary(fixture.summary));
    expect(captured.gridProps.report).not.toHaveProperty("metric.contributions");
    expect(captured.gridProps.report).not.toHaveProperty("metric.exclusions");
    expect(captured.gridProps.rows).toBe(fixture.grouped.groups);
    expect(captured.gridProps.matchedGroupCount).toBe(2);
    expect(captured.gridProps.matchedTargetCount).toBe(2);
    expect(fixture.grouped.groups[0]?.rankGroupReport).toBe(fixture.groups[0]?.rankGroupReport);
    expect(mocks.getRankTrackerGroupedList.mock.calls[0]?.[1]).toBe(getPageReportOptions());
  });

  it("canonicalizes only pagination while preserving explicit false and captured saved-view scope", async () => {
    const view = pageView(2);
    mocks.listSessionSavedViews.mockResolvedValue([view]);
    mocks.getRankTrackerKeywordList.mockImplementation(async ({ query }) => ({
      ...pageFlatList(query),
      matchedTargetCount: 150,
      totalCount: 150,
      page: 2,
      pageCount: 2,
    }));
    await expect(
      renderPage({ view: view.id, grouped: "0", page: "99", q: "", action: "filter" }),
    ).rejects.toThrow("NEXT_REDIRECT:");
    const href = String(redirect.mock.calls[0]?.[0]);
    const params = new URL(href, "https://example.test").searchParams;
    expect(params.get("page")).toBe("2");
    expect(params.get("view")).toBe(view.id);
    expect(params.get("grouped")).toBe("0");
    expect(params.get("q")).toBe("");
    expect(params.get("action")).toBe("filter");
    expect(mocks.getRankTrackerKeywordList).toHaveBeenCalledWith(
      {
        projectRef: "prj_1",
        query: expect.objectContaining({
          page: 99,
          pageSize: 100,
          savedViewId: view.id,
          grouped: false,
          search: "",
          lens: { device: "mobile", locationId: "krakow" },
          filters: expect.objectContaining({ tags: ["Service"] }),
        }),
      },
      getPageReportOptions(),
    );
    expect(mocks.getRankTrackerGroupedList).not.toHaveBeenCalled();
  });
});
