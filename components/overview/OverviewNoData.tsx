import type {
  GetFirstCheckRunPlanAction,
  QueueFirstChecksAction,
  RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import type { ProjectRef } from "@/lib/routing/app-path";
import {
  DataSourceNoDataPanel,
  RecentlyAddedCard,
  ViewAllKeywordsButton,
} from "./OverviewNoDataBottom";
import { NoDataBanner, NoDataCharts, NoDataKpiRow } from "./OverviewNoDataTop";
import type { OverviewView } from "./types";

export type OverviewNoDataProps = {
  budgetExhausted: boolean;
  getFirstCheckRunPlanAction: GetFirstCheckRunPlanAction;
  projectId: string;
  projectRef: ProjectRef;
  queueFirstChecksAction: QueueFirstChecksAction;
  runningCheckCount: number;
  runCheckNowAction: RunFirstCheckAction;
  overview: OverviewView;
};

export function OverviewNoData({
  budgetExhausted,
  getFirstCheckRunPlanAction,
  overview,
  projectId,
  projectRef,
  queueFirstChecksAction,
  runningCheckCount,
  runCheckNowAction,
}: Readonly<OverviewNoDataProps>) {
  const keywordCount = overview.trackedKeywordCount ?? 0;
  const bannerState = overview.projectReadOnly
    ? "migration_hold"
    : runningCheckCount > 0
      ? "running"
      : overview.serpProviderState;
  const recentlyAddedRows =
    overview.highlights.find((list) => list.kind === "recentlyAdded")?.rows ?? [];

  return (
    <div className="flex min-w-0 flex-col gap-4">
      <NoDataBanner
        getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
        keywordCount={keywordCount}
        keywordId={overview.firstPendingKeywordId}
        projectId={projectId}
        projectRef={projectRef}
        queueFirstChecksAction={queueFirstChecksAction}
        runCheckNowAction={runCheckNowAction}
        state={bannerState}
      />
      <NoDataKpiRow
        budgetExhausted={budgetExhausted}
        keywordCount={keywordCount}
        projectReadOnly={overview.projectReadOnly}
        runningCheckCount={runningCheckCount}
        serpProviderState={overview.serpProviderState}
      />
      <NoDataCharts
        distribution={overview.distribution}
        domain={overview.domain}
        trend={overview.trend}
      />
      <DataSourceNoDataPanel health={overview.dataSource} />
      <RecentlyAddedCard projectRef={projectRef} rows={recentlyAddedRows} />
      <ViewAllKeywordsButton projectRef={projectRef} />
    </div>
  );
}
