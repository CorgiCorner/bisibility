import { DataSourcePanel } from "@/components/overview/DataSourcePanel";
import { HighlightLists } from "@/components/overview/HighlightLists";
import { KpiCard } from "@/components/overview/KpiCard";
import { OverviewEmpty } from "@/components/overview/OverviewEmpty";
import { OverviewNoData } from "@/components/overview/OverviewNoData";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { OverviewToolbar } from "@/components/overview/OverviewToolbar";
import { PositionDistributionCard } from "@/components/overview/PositionDistributionCard";
import { PositionTrendCard } from "@/components/overview/PositionTrendCard";
import type { OverviewView } from "@/components/overview/types";
import { SampleProjectBanner } from "@/components/sample-data/SampleProjectBanner";
import { PageContent } from "@/components/shell/PageContent";
import { AlertBanner, Button } from "@/components/ui";
import { addKeywords } from "@/lib/actions/keyword";
import { importTopQueries } from "@/lib/actions/keyword-suggest";
import { getFirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { queueFirstChecks, runCheckNow } from "@/lib/actions/rankCheck";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { pluralize } from "@/lib/format/pluralize";
import { getQueryActor, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getOverview, type OverviewFilters, parseOverviewFilters } from "@/lib/queries/overview";
import type { WorkspaceDataState } from "@/lib/queries/workspace-state";
import { appPath } from "@/lib/routing/app-path";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/ssr";
import Link from "next/link";
import { type ComponentProps, type ReactNode, Suspense } from "react";

type OverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

type CheckHealthView = Awaited<ReturnType<typeof getCheckHealth>>;

const money = new Intl.NumberFormat("en-US", { currency: "USD", style: "currency" });

function moneyFromCents(cents: number) {
  return money.format(cents / 100);
}

function CheckHealthBanners({
  checkHealth,
  projectRef,
}: Readonly<{ checkHealth: CheckHealthView; projectRef: string }>) {
  const latest = checkHealth.failed24h.latest;
  const failureDetail = latest
    ? `${latest.keyword} · ${latest.provider}: ${latest.error ?? "No error details recorded."}`
    : null;

  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
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
            href: appPath(projectRef, "checks"),
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
    </div>
  );
}

function OverviewSections({
  banner,
  checkHealth,
  overview,
  projectRef,
}: Readonly<{
  banner?: ReactNode;
  checkHealth: CheckHealthView;
  overview: OverviewView;
  projectRef: string;
}>) {
  const { dataSource, distribution, highlights, kpis, trend } = overview;
  const hasBanner = checkHealth.failed24h.count > 0 || checkHealth.budget.exhausted;

  return (
    <>
      <OverviewToolbar
        initialSelected={overview.toolbar}
        key={`${overview.domain}:${overview.toolbar.rangeValue}:${overview.toolbar.deviceValue}:${overview.toolbar.tagValue ?? "all"}`}
        projectRef={projectRef}
      />
      <div className="flex min-w-0 flex-col gap-[18px]">
        {banner}
        {hasBanner ? (
          <CheckHealthBanners checkHealth={checkHealth} projectRef={projectRef} />
        ) : null}
        <section
          aria-label="Overview KPIs"
          className="grid grid-cols-2 gap-4 lg:grid-cols-[repeat(4,minmax(0,1fr))]"
        >
          {kpis.map((kpi) => (
            <KpiCard {...kpi} key={kpi.label} />
          ))}
        </section>
        <section className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.85fr)_minmax(0,1fr)]">
          <PositionTrendCard
            data={trend}
            empty={trend.length === 0}
            seriesLabel={overview.domain}
            takeaway={overview.trendTakeaway}
          />
          <PositionDistributionCard
            buckets={distribution}
            empty={distribution.every((bucket) => bucket.count === 0)}
          />
        </section>
        <DataSourcePanel checkHealth={checkHealth} health={dataSource} />
        <HighlightLists lists={highlights} projectRef={projectRef} />
        <Button
          component={Link}
          endIcon={<CaretRight size={15} weight="bold" />}
          href={appPath(projectRef, "keywords")}
          sx={{
            alignSelf: "flex-start",
            minHeight: 38,
            "&:hover": { borderColor: "var(--accent)", color: "var(--accent-text)" },
          }}
          variant="secondary"
        >
          View all keywords
        </Button>
      </div>
    </>
  );
}

async function OverviewData({
  capabilities,
  filters,
  preferences,
  projectRef,
  isSample,
}: Readonly<{
  capabilities: ComponentProps<typeof OverviewEmpty>["capabilities"];
  filters: OverviewFilters;
  preferences: Awaited<ReturnType<typeof getPreferences>>;
  projectRef: import("@/lib/routing/app-path").ProjectRef;
  isSample: boolean;
}>) {
  const now = new Date();
  const [overview, checkHealth, costContext] = await Promise.all([
    getOverview(projectRef, { filters, preferences }),
    getCheckHealth(projectRef, { now }),
    getProjectCostContext(projectRef),
  ]);
  const state: WorkspaceDataState = overview.state ?? (overview.isEmpty ? "empty" : "populated");
  const overviewView: OverviewView = { ...overview, state };
  const sampleBanner = isSample ? (
    <SampleProjectBanner projectId={projectRef} projectRef={projectRef} />
  ) : null;

  if (state === "empty") {
    return (
      <div className="flex min-w-0 flex-col gap-[18px]">
        {sampleBanner}
        <OverviewEmpty
          addKeywordsAction={addKeywords}
          capabilities={capabilities}
          costContext={costContext}
          gettingStarted={overviewView.gettingStarted}
          importTopQueriesAction={importTopQueries}
          workspaceName={overviewView.workspaceName}
        />
      </div>
    );
  }

  if (state === "no-data") {
    return (
      <div className="flex min-w-0 flex-col gap-[18px]">
        {sampleBanner}
        <OverviewNoData
          budgetExhausted={checkHealth.budget.exhausted}
          getFirstCheckRunPlanAction={getFirstCheckRunPlan}
          overview={overviewView}
          projectId={projectRef}
          projectRef={overview.publicId}
          queueFirstChecksAction={queueFirstChecks}
          runningCheckCount={checkHealth.runningCount}
          runCheckNowAction={runCheckNow}
        />
      </div>
    );
  }

  return (
    <OverviewSections
      banner={sampleBanner}
      checkHealth={checkHealth}
      overview={overviewView}
      projectRef={overview.publicId}
    />
  );
}

export default async function OverviewPage({
  params: routeParams,
  searchParams,
}: Readonly<OverviewPageProps>) {
  const { project } = await routeParams;
  const [{ isSample, projectId, publicId }, actor] = await Promise.all([
    resolveProjectAccess(project),
    getQueryActor(),
  ]);
  const role = getProjectRole(actor, projectId);
  const capabilities = {
    canCreateKeywords: canProjectAction(role, "create", "keyword"),
    canInstallSampleData: Boolean(actor.id),
    canManageImports: canProjectAction(role, "manage", "cloud_import_job"),
    canManageProviders: canProjectAction(role, "manage", "provider_connection"),
  };
  const [search, preferences] = await Promise.all([searchParams, getPreferences()]);
  const filters = parseOverviewFilters(search);

  return (
    <PageContent>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewData
          capabilities={capabilities}
          filters={filters}
          preferences={preferences}
          isSample={isSample}
          projectRef={publicId}
        />
      </Suspense>
    </PageContent>
  );
}
