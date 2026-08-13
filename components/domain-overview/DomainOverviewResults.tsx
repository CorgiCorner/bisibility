import type { SaveSelectedKeywordsAction } from "@/lib/actions/domain-overview";
import type { DomainOverviewReport } from "@/lib/domain-overview/types";
import type { HistoricalOverviewRow } from "@/lib/providers/types";
import { DomainOverviewBacklinksTeaser } from "./DomainOverviewBacklinksTeaser";
import { DomainOverviewContextBar } from "./DomainOverviewContextBar";
import { DomainOverviewDistribution } from "./DomainOverviewDistribution";
import { DomainOverviewKeywordsTable } from "./DomainOverviewKeywordsTable";
import { DomainOverviewKpiRow } from "./DomainOverviewKpiRow";
import { DomainOverviewPagesTable } from "./DomainOverviewPagesTable";
import { DomainOverviewPerformanceChart } from "./DomainOverviewPerformanceChart";
import { DomainOverviewNoDataCard, DomainOverviewStatePanel } from "./DomainOverviewStatePanel";
import { DomainOverviewWhatChanged } from "./DomainOverviewWhatChanged";
import { saveDomainKeywords } from "./domain-overview-keyword-tracking";
import type { DomainOverviewMarketView } from "./domain-overview-workspace-model";

type DomainOverviewResultsProps = {
  history: HistoricalOverviewRow[] | null;
  historyError: boolean;
  historyEstimateCents: number | null;
  historyLoading: boolean;
  market: DomainOverviewMarketView;
  onLoadHistory: () => void;
  onLoadMoreKeywords: () => void;
  onLoadMorePages: () => void;
  projectRef: string;
  report: DomainOverviewReport;
  tableEstimateCents: { keywords: number | null; pages: number | null };
  tableError: "keywords" | "pages" | null;
  tableFetchedCount: { keywords: number; pages: number };
  tableHasMore: { keywords: boolean; pages: boolean };
  tableLoading: "keywords" | "pages" | null;
  saveSelectedKeywordsAction?: SaveSelectedKeywordsAction;
};

export function DomainOverviewResults({
  history,
  historyError,
  historyEstimateCents,
  historyLoading,
  market,
  onLoadHistory,
  onLoadMoreKeywords,
  onLoadMorePages,
  projectRef,
  report,
  tableEstimateCents,
  tableError,
  tableFetchedCount,
  tableHasMore = { keywords: false, pages: false },
  tableLoading,
  saveSelectedKeywordsAction,
}: Readonly<DomainOverviewResultsProps>) {
  const metrics = report.overview;
  return (
    <div aria-live="polite" className="grid min-w-0 gap-[18px]">
      <DomainOverviewContextBar report={report} />
      {report.state === "no_data" || !metrics ? (
        <>
          <DomainOverviewKpiRow
            metrics={null}
            previous={null}
            previousSourceSnapshotAt={null}
            sourceSnapshotAt={report.sourceSnapshotAt}
          />
          <DomainOverviewNoDataCard
            description="The selected domain has no indexed organic history in this market."
            sectionTitle="Organic performance"
            title="No index history to display"
          />
          <DomainOverviewStatePanel
            market={market.displayName}
            projectRef={projectRef}
            state="no_data"
            target={report.target}
          />
        </>
      ) : (
        <>
          <DomainOverviewKpiRow
            metrics={metrics}
            previous={report.previousOverview}
            previousSourceSnapshotAt={report.previousSourceSnapshotAt}
            sourceSnapshotAt={report.sourceSnapshotAt}
          />
          <div className="grid min-w-0 gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
            <DomainOverviewPerformanceChart
              estimateCents={historyEstimateCents}
              failed={historyError}
              history={history}
              loading={historyLoading}
              onLoad={onLoadHistory}
            />
            <DomainOverviewWhatChanged
              metrics={metrics}
              sourceSnapshotAt={report.sourceSnapshotAt}
            />
          </div>
          <DomainOverviewDistribution metrics={metrics} />
          {report.keywords.ok ? (
            <DomainOverviewKeywordsTable
              estimateCents={tableEstimateCents.keywords}
              fetchedCount={tableFetchedCount.keywords}
              hasMore={tableHasMore.keywords}
              key={`${report.target}:${report.scope}:${report.fetchedAt}:keywords`}
              loadMoreError={tableError === "keywords"}
              loadingMore={tableLoading === "keywords"}
              onLoadMore={onLoadMoreKeywords}
              onSaveSelected={
                saveSelectedKeywordsAction
                  ? (rows) =>
                      saveDomainKeywords(saveSelectedKeywordsAction, {
                        market,
                        projectId: projectRef,
                        report,
                        rows,
                      })
                  : undefined
              }
              page={report.keywords.data}
            />
          ) : (
            <DomainOverviewStatePanel projectRef={projectRef} state="partial" />
          )}
          {report.pages.ok ? (
            <DomainOverviewPagesTable
              estimateCents={tableEstimateCents.pages}
              fetchedCount={tableFetchedCount.pages}
              hasMore={tableHasMore.pages}
              key={`${report.target}:${report.scope}:${report.fetchedAt}:pages`}
              loadMoreError={tableError === "pages"}
              loadingMore={tableLoading === "pages"}
              onLoadMore={onLoadMorePages}
              result={report.pages.data}
            />
          ) : (
            <DomainOverviewStatePanel projectRef={projectRef} state="partial" />
          )}
          <DomainOverviewBacklinksTeaser projectRef={projectRef} target={report.target} />
        </>
      )}
    </div>
  );
}
