"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import type { StoredResultFreshness } from "@/components/demo-research/StoredResultFreshness";
import type { SaveSelectedKeywordsAction } from "@/lib/actions/domain-overview";
import type { DomainModuleOutcome, DomainOverviewReport } from "@/lib/domain-overview/types";
import type {
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";
import type { ResearchScope } from "@/lib/research/scope";
import { useTranslations } from "next-intl";
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

type DomainOverviewResultsProps = {
  history: HistoricalOverviewRow[] | null;
  historyError: boolean;
  historyEstimateCents?: number | null;
  historyLoading: boolean;
  onLoadHistory?: () => void;
  onLoadMoreKeywords?: () => void;
  onLoadMorePages?: () => void;
  projectRef: string;
  readOnly?: boolean;
  report: Omit<DomainOverviewReport, "cachedUntil" | "historyMode" | "keywords" | "pages"> & {
    historyMode?: "lazy";
    keywords?: DomainModuleOutcome<RankedKeywordsPage>;
    pages?: DomainModuleOutcome<RelevantPagesResult>;
  };
  researchScope?: ResearchScope & { providerLocationCode: number };
  storedFreshness?: StoredResultFreshness;
  storedModules?: { keywords: RankedKeywordsPage | null; pages: RelevantPagesResult | null };
  tableEstimateCents?: { keywords: number | null; pages: number | null };
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
  onLoadHistory,
  onLoadMoreKeywords,
  onLoadMorePages,
  projectRef,
  readOnly = false,
  report,
  researchScope,
  storedFreshness,
  storedModules,
  tableEstimateCents,
  tableError,
  tableFetchedCount,
  tableHasMore = { keywords: false, pages: false },
  tableLoading,
  saveSelectedKeywordsAction,
}: Readonly<DomainOverviewResultsProps>) {
  const dateFormat = useDateFormat();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  const metrics = report.overview;
  const keywords = readOnly
    ? (storedModules?.keywords ?? null)
    : report.keywords?.ok
      ? report.keywords.data
      : null;
  const pages = readOnly
    ? (storedModules?.pages ?? null)
    : report.pages?.ok
      ? report.pages.data
      : null;
  return (
    <div aria-live="polite" className="grid min-w-0 gap-4.5">
      <DomainOverviewContextBar
        dateFormat={dateFormat}
        report={report}
        storedFreshness={storedFreshness}
      />
      {report.state === "no_data" || !metrics ? (
        <>
          <DomainOverviewKpiRow
            dateFormat={dateFormat}
            metrics={null}
            previous={null}
            previousSourceSnapshotAt={null}
            sourceSnapshotAt={report.sourceSnapshotAt}
          />
          <DomainOverviewNoDataCard
            description={t("noIndexDescription")}
            sectionTitle={t("organicPerformance")}
            title={t("noIndexTitle")}
          />
          {readOnly ? null : (
            <DomainOverviewStatePanel
              projectRef={projectRef}
              researchScope={researchScope}
              state="no_data"
              target={report.target}
            />
          )}
        </>
      ) : (
        <>
          <DomainOverviewKpiRow
            dateFormat={dateFormat}
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
              readOnly={readOnly}
            />
            <DomainOverviewWhatChanged
              dateFormat={dateFormat}
              metrics={metrics}
              sourceSnapshotAt={report.sourceSnapshotAt}
            />
          </div>
          <DomainOverviewDistribution metrics={metrics} />
          {keywords ? (
            <DomainOverviewKeywordsTable
              estimateCents={tableEstimateCents?.keywords}
              fetchedCount={tableFetchedCount.keywords}
              hasMore={tableHasMore.keywords}
              key={`${report.target}:${report.scope}:${report.fetchedAt}:keywords`}
              loadMoreError={tableError === "keywords"}
              loadingMore={tableLoading === "keywords"}
              onLoadMore={readOnly ? undefined : onLoadMoreKeywords}
              onSaveSelected={
                !readOnly && saveSelectedKeywordsAction && researchScope
                  ? (rows) =>
                      saveDomainKeywords(saveSelectedKeywordsAction, {
                        researchScope,
                        projectId: projectRef,
                        report: report as DomainOverviewReport,
                        rows,
                      })
                  : undefined
              }
              page={keywords}
              readOnly={readOnly}
            />
          ) : (
            <DomainOverviewNoDataCard
              description={t("keywordRowsMissing")}
              sectionTitle={t("topOrganicKeywords")}
              title={t("keywordRowsTitle")}
            />
          )}
          {pages ? (
            <DomainOverviewPagesTable
              estimateCents={tableEstimateCents?.pages}
              fetchedCount={tableFetchedCount.pages}
              hasMore={tableHasMore.pages}
              key={`${report.target}:${report.scope}:${report.fetchedAt}:pages`}
              loadMoreError={tableError === "pages"}
              loadingMore={tableLoading === "pages"}
              onLoadMore={readOnly ? undefined : onLoadMorePages}
              result={pages}
            />
          ) : (
            <DomainOverviewNoDataCard
              description={t("pageRowsMissing")}
              sectionTitle={t("topPages")}
              title={t("pageRowsTitle")}
            />
          )}
          {!readOnly ? (
            <DomainOverviewBacklinksTeaser projectRef={projectRef} target={report.target} />
          ) : null}
        </>
      )}
    </div>
  );
}
