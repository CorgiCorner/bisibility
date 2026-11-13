import { SearchInsightsBody } from "@/components/search-insights/SearchInsightsBody";
import { SearchInsightsClicksChart } from "@/components/search-insights/SearchInsightsClicksChart";
import { SearchInsightsConversionsCard } from "@/components/search-insights/SearchInsightsConversionsCard";
import { SearchInsightsNoDataState } from "@/components/search-insights/SearchInsightsEmptyStates";
import { SearchInsightsGa4OauthCard } from "@/components/search-insights/SearchInsightsGa4OauthCard";
import type { SearchInsightsOauthReturn } from "@/components/search-insights/SearchInsightsOauthReturn";
import { SearchInsightsSessionsCard } from "@/components/search-insights/SearchInsightsSessionsCard";
import {
  SearchInsightsSignalChips,
  SearchInsightsSignalChipsResolver,
  type SearchInsightsSignalResult,
} from "@/components/search-insights/SearchInsightsSignalChips";
import { SearchInsightsTrustStrip } from "@/components/search-insights/SearchInsightsTrustStrip";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import { loadConversionReport } from "@/lib/conversions/report";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { dateFromKey, type FinalizedWindow } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsDailyClicks } from "@/lib/search-insights/queries/daily-clicks";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import { conversionsKpi } from "@/lib/search-insights/queries/kpis-model";
import type { SearchInsightsOauthReturn as OauthReturn } from "@/lib/search-insights/queries/oauth-return";
import type { SearchInsightsSignals } from "@/lib/search-insights/queries/signals";
import type { SearchInsightsStatus } from "@/lib/search-insights/status-facts";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";
import { Suspense } from "react";

/**
 * The page creates one first-view promise and one signals promise from the same resolved scope.
 * The strip and body share the first view, while only the chips await signals, so each stored
 * lane is read once without holding the tables behind the signal counts.
 */
export async function SearchInsightsTrustStripSection({
  canManageProviders,
  importState,
  pauseAction,
  projectId,
  resumeAction,
  retryAction,
  status,
  view,
}: Readonly<{
  canManageProviders: boolean;
  importState: SearchInsightsImportState | null;
  pauseAction: SearchInsightsImportAction;
  resumeAction: SearchInsightsImportAction;
  retryAction: SearchInsightsImportAction;
  projectId: string;
  status: Promise<SearchInsightsStatus>;
  view: Promise<SearchInsightsFirstView>;
}>) {
  const [data, runtime] = await Promise.all([view, status]);
  return (
    <SearchInsightsTrustStrip
      canManageProviders={canManageProviders}
      coverage={data.coverage}
      deploymentMode={data.deploymentMode}
      localViewReady={importState?.facts?.readyThrough.d1.current === true}
      providerAvailabilitySource={importState?.availabilityBoundarySource ?? null}
      providerAvailableThrough={importState?.newestFinalizedDate ?? null}
      importState={importState}
      incidents={data.incidents}
      pauseAction={pauseAction}
      projectId={projectId}
      resumeAction={resumeAction}
      retryAction={retryAction}
      statusFacts={runtime.facts}
      workerStatus={runtime.workerStatus}
    />
  );
}

export async function SearchInsightsNoDataSection({
  canManageProviders,
  pauseAction,
  projectId,
  resumeAction,
  retryAction,
  status,
}: Readonly<{
  canManageProviders: boolean;
  pauseAction: SearchInsightsImportAction;
  projectId: string;
  resumeAction: SearchInsightsImportAction;
  retryAction: SearchInsightsImportAction;
  status: Promise<SearchInsightsStatus>;
}>) {
  const runtime = await status;
  return (
    <SearchInsightsNoDataState
      canManageProviders={canManageProviders}
      facts={runtime.facts}
      pauseAction={pauseAction}
      projectId={projectId}
      resumeAction={resumeAction}
      retryAction={retryAction}
    />
  );
}

export async function SearchInsightsClicksChartSection({
  chart,
  projectId,
}: Readonly<{
  chart: Promise<SearchInsightsDailyClicks>;
  projectId: string;
}>) {
  const data = await chart;
  return (
    <SearchInsightsClicksChart markers={data.markers} points={data.points} projectId={projectId} />
  );
}

async function conversionsPresentation(
  projectId: string,
  window: FinalizedWindow | null | undefined,
  requested: string | null | undefined,
  period: string,
) {
  if (!window) return { card: null, slot: null };
  const report = await loadConversionReport(
    projectId,
    { from: dateFromKey(window.current.start), to: dateFromKey(window.current.end) },
    requested,
    {
      pageLimit: 8,
      previous: {
        from: dateFromKey(window.previous.start),
        to: dateFromKey(window.previous.end),
      },
    },
  );
  const slot =
    report.kind === "connect"
      ? {
          href: appPath(asProjectRef(projectId), "settings", "conversions"),
          kind: "connect" as const,
        }
      : {
          kind: "value" as const,
          kpi: conversionsKpi({
            current: report.current,
            goalCount: report.goalCount,
            previous: report.previous,
            previousCovered: period !== "1",
            source: report.source,
          }),
        };
  return {
    card: <SearchInsightsConversionsCard projectId={projectId} report={report} />,
    slot,
  };
}

export async function SearchInsightsBodySection({
  cancelAction,
  clicksChart,
  completeAction,
  conversionRequest,
  conversionWindow,
  disconnectAction,
  ga4Oauth,
  importState,
  loadRowsAction,
  period,
  projectId,
  property,
  returnPath,
  signals,
  syncPlan,
  view,
}: Readonly<{
  cancelAction: React.ComponentProps<typeof SearchInsightsOauthReturn>["cancelAction"];
  clicksChart?: React.ReactNode;
  conversionRequest?: string | null;
  conversionWindow?: FinalizedWindow | null;
  completeAction: React.ComponentProps<typeof SearchInsightsOauthReturn>["completeAction"];
  disconnectAction: React.ComponentProps<typeof SearchInsightsOauthReturn>["disconnectAction"];
  ga4Oauth?: OauthReturn;
  importState: SearchInsightsImportState | null;
  loadRowsAction: LoadSearchInsightsRowsAction;
  period: string;
  projectId: string;
  property: string;
  returnPath: string;
  signals: Promise<SearchInsightsSignals>;
  syncPlan?: SearchSyncPreflightPlan;
  view: Promise<SearchInsightsFirstView>;
}>) {
  const conversionsPromise = conversionsPresentation(
    projectId,
    conversionWindow,
    conversionRequest,
    period,
  );
  const data = await view;
  const conversions = await conversionsPromise;
  const signalResult = signals.then<SearchInsightsSignalResult, SearchInsightsSignalResult>(
    (counts) => ({ signals: counts, state: "ready" }),
    () => ({ state: "error" }),
  );
  const ga4Card =
    ga4Oauth?.provider === "ga4" && (ga4Oauth.setup || ga4Oauth.error) ? (
      <SearchInsightsGa4OauthCard
        cancelAction={cancelAction}
        completeAction={completeAction}
        disconnectAction={disconnectAction}
        oauth={ga4Oauth}
        projectId={projectId}
        returnPath={returnPath}
        syncPlan={syncPlan}
      />
    ) : data.organicSessions.status === "not_connected" ? (
      <SearchInsightsSessionsCard projectId={projectId} />
    ) : null;
  return (
    <SearchInsightsBody
      clicksChart={clicksChart}
      conversions={conversions.slot}
      importState={importState}
      loadRowsAction={loadRowsAction}
      period={period}
      projectId={projectId}
      property={property}
      signalChips={
        <Suspense
          fallback={
            <SearchInsightsSignalChips
              conversionsCard={conversions.card}
              ga4Card={ga4Card}
              namedQueryCount={data.queries.total}
              state="pending"
            />
          }
        >
          <SearchInsightsSignalChipsResolver
            conversionsCard={conversions.card}
            ga4Card={ga4Card}
            namedQueryCount={data.queries.total}
            result={signalResult}
          />
        </Suspense>
      }
      view={data}
    />
  );
}
