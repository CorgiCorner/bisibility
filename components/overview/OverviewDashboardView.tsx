import { ByMarketRollup } from "@/components/overview/ByMarketRollup";
import { DataSourcePanel } from "@/components/overview/DataSourcePanel";
import { HighlightLists } from "@/components/overview/HighlightLists";
import { OverviewHealthBanners } from "@/components/overview/OverviewHealthBanners";
import { OverviewKpiGrid } from "@/components/overview/OverviewKpiGrid";
import { OverviewNoData } from "@/components/overview/OverviewNoData";
import { ViewAllKeywordsButton } from "@/components/overview/OverviewNoDataBottom";
import { OverviewToolbar } from "@/components/overview/OverviewToolbar";
import { PositionDistributionCard } from "@/components/overview/PositionDistributionCard";
import { PositionTrendCard } from "@/components/overview/PositionTrendCard";
import type { OverviewView } from "@/components/overview/types";
import { SampleProjectBanner } from "@/components/sample-data/SampleProjectBanner";
import { getFirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { queueFirstChecks, runCheckNow } from "@/lib/actions/rankCheck";
import type { OverviewCompetitorComparison } from "@/lib/competitors/overview-comparison";
import type { CheckHealth } from "@/lib/queries/check-health";
import type { ReactNode } from "react";
import { OverviewCompetitorsCard } from "./OverviewCompetitorsCard";

function OverviewSections({
  banner,
  canCreateKeyword,
  checkHealth,
  competitors,
  overview,
  projectRef,
}: Readonly<{
  banner?: ReactNode;
  canCreateKeyword: boolean;
  checkHealth: CheckHealth;
  competitors?: OverviewCompetitorComparison | null;
  overview: OverviewView;
  projectRef: string;
}>) {
  const { dataSource, distribution, highlights, kpis, trend } = overview;
  const hasBanner = checkHealth.failed24h.count > 0 || checkHealth.budget.exhausted;

  return (
    <>
      <OverviewToolbar
        canCreateKeyword={canCreateKeyword}
        initialSelected={overview.toolbar}
        key={`${overview.domain}:${overview.toolbar.rangeValue}:${overview.toolbar.deviceValue}:${overview.toolbar.marketValues.join(",")}:${overview.toolbar.tagValue ?? "all"}`}
        projectRef={projectRef}
      />
      <div className="flex min-w-0 flex-col gap-4.5">
        {banner}
        {hasBanner ? (
          <OverviewHealthBanners checkHealth={checkHealth} projectRef={projectRef} />
        ) : null}
        <OverviewKpiGrid
          kpis={kpis}
          projectRef={projectRef}
          visibilityCoverage={overview.visibilityCoverage}
        />
        <PositionTrendCard
          data={trend}
          empty={trend.length === 0}
          seriesLabel={overview.domain}
          takeaway={overview.trendTakeaway}
        />
        <section
          className="grid min-w-0 gap-4 lg:grid-cols-2"
          data-testid="overview-secondary-cards"
        >
          <PositionDistributionCard
            buckets={distribution}
            empty={distribution.every((bucket) => bucket.count === 0)}
          />
          <HighlightLists
            lists={highlights.filter((list) => list.kind === "recentlyAdded")}
            projectRef={projectRef}
          />
        </section>
        <DataSourcePanel checkHealth={checkHealth} health={dataSource} />
        <ByMarketRollup
          device={overview.toolbar.deviceValue}
          projectRef={projectRef}
          rows={overview.byMarket}
        />
        {competitors ? (
          <OverviewCompetitorsCard data={competitors} projectRef={projectRef} />
        ) : null}
        <HighlightLists
          lists={highlights.filter((list) => list.kind !== "recentlyAdded")}
          projectRef={projectRef}
        />
        <ViewAllKeywordsButton projectRef={projectRef} />
      </div>
    </>
  );
}

export type OverviewDashboardViewProps = {
  canCreateKeyword?: boolean;
  canManageProviders?: boolean;
  canRunChecks?: boolean;
  checkHealth: CheckHealth;
  isSample: boolean;
  competitors?: OverviewCompetitorComparison | null;
  overview: OverviewView;
};

export function OverviewDashboardView({
  canCreateKeyword = true,
  canManageProviders = true,
  canRunChecks = true,
  checkHealth,
  competitors,
  isSample,
  overview,
}: Readonly<OverviewDashboardViewProps>) {
  const sampleBanner = isSample ? (
    <SampleProjectBanner projectId={overview.publicId} projectRef={overview.publicId} />
  ) : null;

  if (isSample || overview.state !== "populated") {
    return (
      <>
        {overview.toolbar.marketOptions.length > 0 ? (
          <OverviewToolbar
            canCreateKeyword={canCreateKeyword}
            initialSelected={overview.toolbar}
            projectRef={overview.publicId}
          />
        ) : null}
        <div className="flex min-w-0 flex-col gap-4.5">
          {sampleBanner}
          <OverviewNoData
            budgetExhausted={checkHealth.budget.exhausted}
            canCreateKeyword={canCreateKeyword}
            canManageProviders={canManageProviders}
            canRunChecks={canRunChecks}
            getFirstCheckRunPlanAction={getFirstCheckRunPlan}
            overview={overview}
            projectId={overview.publicId}
            projectRef={overview.publicId}
            queueFirstChecksAction={queueFirstChecks}
            runningCheckCount={checkHealth.runningCount}
            runCheckNowAction={runCheckNow}
          />
        </div>
      </>
    );
  }

  return (
    <OverviewSections
      canCreateKeyword={canCreateKeyword}
      banner={sampleBanner}
      checkHealth={checkHealth}
      competitors={competitors}
      overview={overview}
      projectRef={overview.publicId}
    />
  );
}
