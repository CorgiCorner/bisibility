"use client";

import { ActionPaymentPrice } from "@/components/action-payment/ActionPaymentPrice";
import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import { useDateFormat } from "@/components/dates/DateFormatProvider";
import type { StoredResultFreshness } from "@/components/demo-research/StoredResultFreshness";
import type { ActionPaymentReceipt } from "@/lib/action-payment/contract";
import type { SaveSelectedKeywordsAction } from "@/lib/actions/domain-overview";
import type { DomainModuleOutcome, DomainOverviewReport } from "@/lib/domain-overview/types";
import type {
  HistoricalOverviewRow,
  RankedKeywordsPage,
  RelevantPagesResult,
} from "@/lib/providers/types";
import type { ResearchScope } from "@/lib/research/scope";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { DomainOverviewBacklinksTeaser } from "./DomainOverviewBacklinksTeaser";
import { DomainOverviewContextBar } from "./DomainOverviewContextBar";
import { DomainOverviewDistribution } from "./DomainOverviewDistribution";
import { DomainOverviewKeywordsTable } from "./DomainOverviewKeywordsTable";
import { DomainOverviewKpiRow } from "./DomainOverviewKpiRow";
import { DomainOverviewMissingModule } from "./DomainOverviewMissingModule";
import { DomainOverviewPagesTable } from "./DomainOverviewPagesTable";
import { DomainOverviewPerformanceChart } from "./DomainOverviewPerformanceChart";
import { DomainOverviewNoDataCard, DomainOverviewStatePanel } from "./DomainOverviewStatePanel";
import { DomainOverviewWhatChanged } from "./DomainOverviewWhatChanged";
import { saveDomainKeywords } from "./domain-overview-keyword-tracking";
import { DomainOverviewRefreshPrice } from "./domain-overview-refresh-price";

type DomainOverviewResultsProps = {
  historyPrice?: ReactNode;
  historyBlocked?: boolean;
  historyPayment?: ActionPaymentReceipt;
  tableBlocked?: readonly ("keywords" | "pages")[];
  tablePayments?: Partial<Record<"keywords" | "pages", ActionPaymentReceipt>>;
  onRefresh?: () => void;
  paymentActions?: Partial<
    Record<"analyze" | "history" | "keywords" | "pages", (input: unknown) => Promise<unknown>>
  >;
  paymentInputs?: Record<"history" | "keywords" | "pages", Record<string, unknown> | null>;
  refreshing?: boolean;
  refreshInput?: Record<string, unknown> | null;
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
  historyPrice,
  historyBlocked,
  historyPayment,
  tableBlocked,
  tablePayments,
  history,
  historyError,
  historyLoading,
  onLoadHistory,
  onLoadMoreKeywords,
  onLoadMorePages,
  onRefresh,
  paymentActions,
  paymentInputs,
  projectRef,
  refreshing = false,
  refreshInput = null,
  readOnly = false,
  report,
  researchScope,
  storedFreshness,
  storedModules,
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
  const showRefresh = !readOnly && Boolean(onRefresh);
  function refreshPrice() {
    return showRefresh && paymentActions?.analyze ? (
      <DomainOverviewRefreshPrice action={paymentActions.analyze} input={refreshInput} />
    ) : null;
  }
  return (
    <div aria-live="polite" className="grid min-w-0 gap-4.5">
      <DomainOverviewContextBar
        countryCode={researchScope?.countryCode}
        dateFormat={dateFormat}
        history={history}
        refresh={
          showRefresh && onRefresh
            ? { busy: refreshing, onClick: onRefresh, price: refreshPrice() }
            : undefined
        }
        report={report}
        storedFreshness={storedFreshness}
      />
      {readOnly ? (
        <PaymentChargeLine original payment={report.originalPayment ?? report.payment} />
      ) : (
        <PaymentChargeLine payment={report.payment} />
      )}
      {!readOnly &&
      report.originalPayment &&
      report.originalPayment.actionId !== report.payment?.actionId ? (
        <PaymentChargeLine original payment={report.originalPayment} />
      ) : null}
      {historyPayment ? <PaymentChargeLine payment={historyPayment} /> : null}
      {tablePayments?.keywords ? <PaymentChargeLine payment={tablePayments.keywords} /> : null}
      {tablePayments?.pages ? <PaymentChargeLine payment={tablePayments.pages} /> : null}
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
              estimateCents={null}
              price={
                paymentActions?.history && paymentInputs ? (
                  <ActionPaymentPrice
                    action={paymentActions.history}
                    input={paymentInputs.history}
                  />
                ) : (
                  historyPrice
                )
              }
              blocked={historyBlocked}
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
              estimateCents={null}
              price={
                paymentActions?.keywords && paymentInputs ? (
                  <ActionPaymentPrice
                    action={paymentActions.keywords}
                    input={paymentInputs.keywords}
                  />
                ) : undefined
              }
              loadMoreBlocked={tableBlocked?.includes("keywords")}
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
            <DomainOverviewMissingModule
              blocked={tableBlocked?.includes("keywords")}
              failed={tableError === "keywords"}
              kind="keywords"
              loading={tableLoading === "keywords"}
              module={report.keywords}
              onLoad={readOnly ? undefined : onLoadMoreKeywords}
              onRefresh={showRefresh ? onRefresh : undefined}
              paymentAction={paymentActions?.keywords}
              paymentInput={paymentInputs?.keywords}
              refreshPrice={refreshPrice()}
              refreshing={refreshing}
            />
          )}
          {pages ? (
            <DomainOverviewPagesTable
              estimateCents={null}
              price={
                paymentActions?.pages && paymentInputs ? (
                  <ActionPaymentPrice action={paymentActions.pages} input={paymentInputs.pages} />
                ) : undefined
              }
              loadMoreBlocked={tableBlocked?.includes("pages")}
              fetchedCount={tableFetchedCount.pages}
              hasMore={tableHasMore.pages}
              key={`${report.target}:${report.scope}:${report.fetchedAt}:pages`}
              loadMoreError={tableError === "pages"}
              loadingMore={tableLoading === "pages"}
              onLoadMore={readOnly ? undefined : onLoadMorePages}
              result={pages}
            />
          ) : (
            <DomainOverviewMissingModule
              blocked={tableBlocked?.includes("pages")}
              failed={tableError === "pages"}
              kind="pages"
              loading={tableLoading === "pages"}
              module={report.pages}
              onLoad={readOnly ? undefined : onLoadMorePages}
              onRefresh={showRefresh ? onRefresh : undefined}
              paymentAction={paymentActions?.pages}
              paymentInput={paymentInputs?.pages}
              refreshPrice={refreshPrice()}
              refreshing={refreshing}
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
