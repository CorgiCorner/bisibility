import type {
  LoadDomainKeywordsPageAction,
  LoadDomainPagesPageAction,
} from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { RankedKeywordRow, RelevantPageRow } from "@/lib/providers/types";
import { act, renderHook } from "@testing-library/react";
import { useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type {
  DomainOverviewEstimateView,
  DomainOverviewMarketView,
  DomainOverviewUiOutcome,
} from "./domain-overview-workspace-model";
import { reportFrom } from "./domain-overview-workspace-model";
import { useDomainOverviewTablePages } from "./useDomainOverviewTablePages";

type KeywordPageOutcome = Awaited<ReturnType<LoadDomainKeywordsPageAction>>;
type PageOutcome = Awaited<ReturnType<LoadDomainPagesPageAction>>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

function keywordRow(keyword: string, rankingUrl: string): RankedKeywordRow {
  return {
    cpcCents: 50,
    difficulty: 5,
    estimatedTraffic: 10,
    intent: "commercial",
    keyword,
    position: 1,
    rankAbsolute: 1,
    rankAbsoluteDelta: 0,
    rankingUrl,
    searchVolume: 100,
    serpFeatures: [],
  };
}

function pageRow(path: string): RelevantPageRow {
  return {
    etv: 10,
    etvDeltaPct: 1,
    keywordCount: 5,
    path,
    topKeyword: "k",
    topKeywordPosition: 1,
  };
}

function buildReport(
  target: string,
  options: {
    keywordConsumedCount?: number;
    keywordRows?: number;
    keywordTotalCount?: number | null;
    pageConsumedCount?: number;
    pageRows?: number;
    pageTotalCount?: number;
    fetchedAt?: string;
  } = {},
): DomainOverviewReport {
  const {
    keywordRows = 100,
    keywordConsumedCount = keywordRows,
    keywordTotalCount = 12_940,
    pageRows = 100,
    pageConsumedCount = pageRows,
    pageTotalCount = 1_204,
    fetchedAt = "2026-08-12T12:00:00.000Z",
  } = options;
  return {
    cached: true,
    cachedUntil: "2026-08-12T22:00:00.000Z",
    costCents: 0,
    fetchedAt,
    historyMode: "lazy",
    keywords: {
      cached: true,
      costCents: 0,
      data: {
        consumedCount: keywordConsumedCount,
        costCents: 0,
        rows: Array.from({ length: keywordRows }, (_, index) =>
          keywordRow(`kw ${index}`, `https://${target}/p${index}`),
        ),
        totalCount: keywordTotalCount,
      },
      fetchedAt,
      ok: true,
    },
    languageCode: "en",
    locationCode: 1_026_201,
    ok: true,
    overview: null,
    pages: {
      cached: true,
      costCents: 0,
      data: {
        consumedCount: pageConsumedCount,
        costCents: 0,
        rows: Array.from({ length: pageRows }, (_, index) => pageRow(`/collections/${index}`)),
        totalCount: pageTotalCount,
      },
      fetchedAt,
      ok: true,
    },
    previousFetchedAt: null,
    previousOverview: null,
    previousSourceSnapshotAt: null,
    provider: "dataforseo",
    scope: "root",
    sourceSnapshotAt: "2026-08-12T00:00:00.000Z",
    state: "ok",
    target,
  };
}

function keywordPageResult(
  rows: RankedKeywordRow[],
  totalCount: number | null,
  costCents = 7,
  consumedCount = rows.length,
): Extract<KeywordPageOutcome, { ok: true }> {
  return {
    cached: false,
    costCents,
    data: { consumedCount, costCents, rows, totalCount },
    fetchedAt: "2026-08-12T12:30:00.000Z",
    ok: true,
  };
}

function pagePageResult(
  rows: RelevantPageRow[],
  totalCount: number,
  costCents = 4,
  consumedCount = rows.length,
): Extract<PageOutcome, { ok: true }> {
  return {
    cached: false,
    costCents,
    data: { consumedCount, costCents, rows, totalCount },
    fetchedAt: "2026-08-12T12:30:00.000Z",
    ok: true,
  };
}

const market: DomainOverviewMarketView = {
  canonicalKey: "US/US-TX/Austin",
  cityName: "Austin",
  countryCode: "US",
  displayName: "Austin, Texas, United States",
  hl: "en",
  kind: "city",
  languageCode: "en",
  languageLabel: "English",
  locationCode: 1_026_201,
  regionName: "Texas",
};

const estimate: DomainOverviewEstimateView = {
  cached: true,
  costCents: 6,
  freshCostCents: 6,
  historyCostCents: 12,
  keywordPageCostCents: 2,
  loading: false,
  pagePageCostCents: 3,
  valid: true,
};

function setupActions() {
  return {
    addSpend: vi.fn<(costCents: number) => void>(),
    loadKeywordsPageAction: vi.fn<LoadDomainKeywordsPageAction>(),
    loadPagesPageAction: vi.fn<LoadDomainPagesPageAction>(),
  };
}

type Actions = ReturnType<typeof setupActions>;

function renderPagesHook(report: DomainOverviewReport, actions: Actions) {
  return renderHook(
    ({ report }: { report: DomainOverviewReport }) => {
      const [outcome, setOutcome] = useState<DomainOverviewUiOutcome | null>(report);
      const api = useDomainOverviewTablePages({
        activeMarket: market,
        addSpend: actions.addSpend,
        estimate,
        loadKeywordsPageAction: actions.loadKeywordsPageAction,
        loadPagesPageAction: actions.loadPagesPageAction,
        projectId: "prj_1",
        report,
        setOutcome,
      });
      return { api, outcome, setOutcome };
    },
    { initialProps: { report } },
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("useDomainOverviewTablePages", () => {
  it("does not merge a stale keyword page into a later report but still pays the cost", async () => {
    const actions = setupActions();
    const reportA = buildReport("example.com");
    const reportB = buildReport("example.org");
    const pending = deferred<KeywordPageOutcome>();
    actions.loadKeywordsPageAction.mockReturnValue(pending.promise);

    const { result, rerender } = renderPagesHook(reportA, actions);

    let loadPromise: Promise<void> = Promise.resolve();
    act(() => {
      loadPromise = result.current.api.loadMore("keywords");
    });
    expect(actions.loadKeywordsPageAction).toHaveBeenCalledTimes(1);
    expect(actions.loadKeywordsPageAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 100, limit: 100, target: "example.com" }),
    );

    rerender({ report: reportB });
    act(() => result.current.setOutcome(reportB));

    await act(async () => {
      pending.resolve(
        keywordPageResult([keywordRow("kw 100", "https://example.com/p100")], 12_940, 9),
      );
      await loadPromise;
    });

    expect(actions.addSpend).toHaveBeenCalledWith(9);
    const report = reportFrom(result.current.outcome);
    expect(report?.target).toBe("example.org");
    expect(report?.keywords.ok).toBe(true);
    const rows = report?.keywords.ok ? report.keywords.data.rows : [];
    expect(rows).toHaveLength(100);
    expect(rows.some((row) => row.keyword === "kw 100")).toBe(false);
    expect(result.current.api.tableError).toBeNull();
  });

  it("advances the keyword offset by the provider row count, not the deduplicated visible length", async () => {
    const actions = setupActions();
    const report = buildReport("example.com", { keywordRows: 100, keywordTotalCount: 12_940 });
    actions.loadKeywordsPageAction.mockResolvedValueOnce(
      keywordPageResult(
        [
          keywordRow("kw 0", "https://example.com/p0"),
          ...Array.from({ length: 99 }, (_, index) =>
            keywordRow(`kw ${index + 100}`, `https://example.com/p${index + 100}`),
          ),
        ],
        12_940,
        5,
      ),
    );

    const { result } = renderPagesHook(report, actions);

    await act(async () => {
      await result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 100, limit: 100 }),
    );
    const firstReport = reportFrom(result.current.outcome);
    expect(firstReport?.keywords.ok).toBe(true);
    const dedupedRows = firstReport?.keywords.ok ? firstReport.keywords.data.rows : [];
    expect(dedupedRows).toHaveLength(199);
    expect(result.current.api.tableHasMore.keywords).toBe(true);

    actions.loadKeywordsPageAction.mockResolvedValueOnce(keywordPageResult([], 12_940, 0));

    await act(async () => {
      await result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 200 }),
    );
  });

  it("uses raw provider consumption when malformed keyword rows are omitted", async () => {
    const actions = setupActions();
    const report = buildReport("example.com", {
      keywordConsumedCount: 100,
      keywordRows: 2,
      keywordTotalCount: 300,
    });
    const malformedPageRows = [
      keywordRow("kw 100", "https://example.com/p100"),
      keywordRow("kw 199", "https://example.com/p199"),
    ];
    actions.loadKeywordsPageAction
      .mockResolvedValueOnce(keywordPageResult(malformedPageRows, 300, 5, 100))
      .mockResolvedValueOnce(keywordPageResult([], 300, 0, 100));

    const { result } = renderPagesHook(report, actions);

    await act(async () => {
      await result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 100 }),
    );
    expect(result.current.api.tableHasMore.keywords).toBe(true);

    await act(async () => {
      await result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 200 }),
    );
  });

  it("marks keywords hasMore false after a short page and skips further action calls", async () => {
    const actions = setupActions();
    const report = buildReport("example.com", { keywordRows: 100, keywordTotalCount: 12_940 });
    actions.loadKeywordsPageAction.mockResolvedValueOnce(keywordPageResult([], 12_940, 1));

    const { result } = renderPagesHook(report, actions);

    await act(async () => {
      await result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenCalledTimes(1);
    expect(result.current.api.tableHasMore.keywords).toBe(false);

    await act(async () => {
      await result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenCalledTimes(1);
  });

  it("marks pages hasMore false once the known total is reached", async () => {
    const actions = setupActions();
    const report = buildReport("example.com", { pageRows: 100, pageTotalCount: 150 });
    actions.loadPagesPageAction.mockResolvedValueOnce(
      pagePageResult(
        Array.from({ length: 100 }, (_, index) => pageRow(`/collections/${100 + index}`)),
        150,
      ),
    );

    const { result } = renderPagesHook(report, actions);

    await act(async () => {
      await result.current.api.loadMore("pages");
    });

    expect(actions.loadPagesPageAction).toHaveBeenLastCalledWith(
      expect.objectContaining({ offset: 100, limit: 100 }),
    );
    expect(result.current.api.tableHasMore.pages).toBe(false);

    await act(async () => {
      await result.current.api.loadMore("pages");
    });

    expect(actions.loadPagesPageAction).toHaveBeenCalledTimes(1);
  });

  it("invokes the keyword action once when two loadMore calls overlap", async () => {
    const actions = setupActions();
    const report = buildReport("example.com");
    const pending = deferred<KeywordPageOutcome>();
    actions.loadKeywordsPageAction.mockReturnValue(pending.promise);

    const { result } = renderPagesHook(report, actions);

    let firstLoad: Promise<void> = Promise.resolve();
    let secondLoad: Promise<void> = Promise.resolve();
    act(() => {
      firstLoad = result.current.api.loadMore("keywords");
      secondLoad = result.current.api.loadMore("keywords");
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenCalledTimes(1);

    await act(async () => {
      pending.resolve(keywordPageResult([], 12_940, 0));
      await firstLoad;
      await secondLoad;
    });

    expect(actions.loadKeywordsPageAction).toHaveBeenCalledTimes(1);
  });
});
