import { ByMarketRollup } from "@/components/overview/ByMarketRollup";
import { DataSourcePanel } from "@/components/overview/DataSourcePanel";
import { HighlightLists } from "@/components/overview/HighlightLists";
import { KpiCard } from "@/components/overview/KpiCard";
import { OverviewNoData } from "@/components/overview/OverviewNoData";
import { ViewAllKeywordsButton } from "@/components/overview/OverviewNoDataBottom";
import { OverviewToolbar } from "@/components/overview/OverviewToolbar";
import { PositionDistributionCard } from "@/components/overview/PositionDistributionCard";
import { PositionTrendCard } from "@/components/overview/PositionTrendCard";
import type { OverviewView } from "@/components/overview/types";
import { SampleProjectBanner } from "@/components/sample-data/SampleProjectBanner";
import { AlertBanner } from "@/components/ui/AlertBanner";
import { AlertBannerStack } from "@/components/ui/AlertBannerStack";
import { getFirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { queueFirstChecks, runCheckNow } from "@/lib/actions/rankCheck";
import type { OverviewCompetitorComparison } from "@/lib/competitors/overview-comparison";
import { pluralize } from "@/lib/format/pluralize";
import type { CheckHealth } from "@/lib/queries/check-health";
import { providerFailurePresentation } from "@/lib/rank-check/failure-presentation";
import { appPath } from "@/lib/routing/app-path";
import { projectRunsPath } from "@/lib/routing/project-runs-path";
import { VISIBILITY_DESCRIPTION, visibilityCoverageCopy } from "@/lib/visibility/definition";
import Link from "next/link";
import type { ReactNode } from "react";
import { OverviewCompetitorsCard } from "./OverviewCompetitorsCard";

const money = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function moneyFromCents(cents: number) {
  return money.format(cents / 100);
}

function CheckHealthBanners({
  checkHealth,
  projectRef,
}: Readonly<{ checkHealth: CheckHealth; projectRef: string }>) {
  const latest = checkHealth.failed24h.latest;
  const failureDetail = latest
    ? `${latest.keyword}: ${providerFailurePresentation(latest.errorCode, latest.error).message}`
    : null;

  return (
    <AlertBannerStack>
      {checkHealth.failed24h.count > 0 ? (
        <AlertBanner
          detail={failureDetail}
          tint="red"
          title={`${pluralize(checkHealth.failed24h.count, "rank check")} failed in the last 24 hours.`}
        />
      ) : null}
      {checkHealth.budget.exhausted ? (
        <AlertBanner
          action={{
            href: projectRunsPath(projectRef),
            icon: "arrow",
            label: "View check runs",
          }}
          detail={
            <>
              Spent {moneyFromCents(checkHealth.budget.spentCents)} of{" "}
              {moneyFromCents(checkHealth.budget.capCents)} this month.{" "}
              <Link
                className="font-semibold text-accent-text hover:underline"
                href={appPath(projectRef, "settings#provider-usage")}
              >
                Raise the budget
              </Link>
            </>
          }
          tint="yellow"
          title="Rank checks paused - monthly budget reached."
        />
      ) : null}
    </AlertBannerStack>
  );
}

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
          <CheckHealthBanners checkHealth={checkHealth} projectRef={projectRef} />
        ) : null}
        <section
          aria-label="Overview KPIs"
          className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]"
        >
          {kpis.map((kpi) => (
            <KpiCard
              {...kpi}
              description={kpi.label === "Visibility" ? VISIBILITY_DESCRIPTION : undefined}
              detail={
                kpi.label === "Visibility"
                  ? visibilityCoverageCopy(overview.visibilityCoverage)
                  : undefined
              }
              key={kpi.label}
              projectRef={projectRef}
            />
          ))}
        </section>
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
