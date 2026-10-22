import type {
  GetFirstCheckRunPlanAction,
  RunFirstCheckAction,
} from "@/components/rank-check/FirstCheckBannerAction";
import type { BudgetDenialReason } from "@/lib/metering/budget-denial";
import type { ProjectRef } from "@/lib/routing/app-path";
import { ByMarketRollup } from "./ByMarketRollup";
import { DataSourceNoDataPanel } from "./OverviewNoDataBottom";
import { NoDataBanner, NoDataCharts, NoDataKpiRow } from "./OverviewNoDataTop";
import type { OverviewView } from "./types";

export type OverviewNoDataProps = {
  budgetExhausted: boolean;
  budgetReason?: BudgetDenialReason;
  canCreateKeyword?: boolean;
  canManageProviders?: boolean;
  canRunChecks?: boolean;
  getFirstCheckRunPlanAction: GetFirstCheckRunPlanAction;
  projectId: string;
  projectRef: ProjectRef;
  runningCheckCount: number;
  runCheckNowAction: RunFirstCheckAction;
  overview: OverviewView;
};

export function OverviewNoData({
  budgetExhausted,
  budgetReason,
  canCreateKeyword = true,
  canManageProviders = true,
  canRunChecks = true,
  getFirstCheckRunPlanAction,
  overview,
  projectId,
  projectRef,
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

  const showFirstCheckIntro =
    bannerState === "ready" &&
    overview.firstCheckSourceReady === true &&
    canRunChecks &&
    overview.firstPendingKeywordId &&
    !budgetExhausted &&
    !overview.hasEverChecked;

  return (
    <div className="flex min-w-0 flex-col gap-4">
      {bannerState !== "ready" || showFirstCheckIntro ? (
        <NoDataBanner
          canCreateKeyword={canCreateKeyword}
          canManageProviders={canManageProviders}
          canRunChecks={canRunChecks}
          getFirstCheckRunPlanAction={getFirstCheckRunPlanAction}
          keywordCount={keywordCount}
          keywordId={overview.firstPendingKeywordId}
          projectId={projectId}
          projectRef={projectRef}
          runCheckNowAction={runCheckNowAction}
          state={bannerState}
        />
      ) : null}
      <NoDataKpiRow
        budgetExhausted={budgetExhausted}
        budgetReason={budgetReason}
        keywordCount={keywordCount}
        projectReadOnly={overview.projectReadOnly}
        runningCheckCount={runningCheckCount}
        serpProviderState={overview.serpProviderState}
        visibilityCoverage={overview.visibilityCoverage}
      />
      <NoDataCharts
        distribution={overview.distribution}
        domain={overview.domain}
        projectRef={projectRef}
        recentlyAddedRows={recentlyAddedRows}
        trend={overview.trend}
      />
      <DataSourceNoDataPanel health={overview.dataSource} />
      <ByMarketRollup
        device={overview.toolbar.deviceValue}
        projectRef={projectRef}
        rows={overview.byMarket}
      />
    </div>
  );
}
