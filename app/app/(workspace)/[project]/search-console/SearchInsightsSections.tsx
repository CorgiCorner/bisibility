import { SearchInsightsBody } from "@/components/search-insights/SearchInsightsBody";
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
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
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
  importState,
  pauseAction,
  projectId,
  resumeAction,
  retryAction,
  status,
  view,
}: Readonly<{
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
  pauseAction,
  projectId,
  resumeAction,
  retryAction,
  status,
}: Readonly<{
  pauseAction: SearchInsightsImportAction;
  projectId: string;
  resumeAction: SearchInsightsImportAction;
  retryAction: SearchInsightsImportAction;
  status: Promise<SearchInsightsStatus>;
}>) {
  const runtime = await status;
  return (
    <SearchInsightsNoDataState
      facts={runtime.facts}
      pauseAction={pauseAction}
      projectId={projectId}
      resumeAction={resumeAction}
      retryAction={retryAction}
    />
  );
}

export async function SearchInsightsBodySection({
  cancelAction,
  completeAction,
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
  const data = await view;
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
      importState={importState}
      loadRowsAction={loadRowsAction}
      period={period}
      projectId={projectId}
      property={property}
      signalChips={
        <Suspense
          fallback={
            <SearchInsightsSignalChips
              ga4Card={ga4Card}
              namedQueryCount={data.queries.total}
              state="pending"
            />
          }
        >
          <SearchInsightsSignalChipsResolver
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
