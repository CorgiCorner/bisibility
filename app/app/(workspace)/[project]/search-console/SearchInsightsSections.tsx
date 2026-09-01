import { SearchInsightsBody } from "@/components/search-insights/SearchInsightsBody";
import { SearchInsightsGa4OauthCard } from "@/components/search-insights/SearchInsightsGa4OauthCard";
import type { SearchInsightsOauthReturn } from "@/components/search-insights/SearchInsightsOauthReturn";
import { SearchInsightsTrustStrip } from "@/components/search-insights/SearchInsightsTrustStrip";
import type { SearchInsightsImportAction } from "@/lib/actions/search-insights";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import type { WorkerTemporalStatus } from "@/lib/ops/worker-temporal-identity";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import type { SearchInsightsOauthReturn as OauthReturn } from "@/lib/search-insights/queries/oauth-return";
import type { SearchSyncControlFacts } from "@/lib/search-insights/sync/control-model";
import type { SearchSyncPreflightPlan } from "@/lib/search-insights/sync/plan";

/**
 * Both sections await the same promise, which the page starts without awaiting: the context
 * card paints straight away, the strip and the body stream in behind their own fallbacks, and
 * the stored rows are read once for the two of them.
 */
export async function SearchInsightsTrustStripSection({
  importState,
  pauseAction,
  projectId,
  resumeAction,
  retryAction,
  statusFacts,
  view,
  workerStatus,
}: Readonly<{
  importState: SearchInsightsImportState | null;
  pauseAction: SearchInsightsImportAction;
  resumeAction: SearchInsightsImportAction;
  retryAction: SearchInsightsImportAction;
  projectId: string;
  statusFacts: SearchSyncControlFacts;
  view: Promise<SearchInsightsFirstView>;
  workerStatus: WorkerTemporalStatus;
}>) {
  const data = await view;
  return (
    <SearchInsightsTrustStrip
      coverage={data.coverage}
      deploymentMode={data.deploymentMode}
      localViewReady={importState?.facts?.readyThrough.d7.current === true}
      providerAvailabilitySource={importState?.availabilityBoundarySource ?? null}
      providerAvailableThrough={importState?.newestFinalizedDate ?? null}
      importState={importState}
      incidents={data.incidents}
      pauseAction={pauseAction}
      projectId={projectId}
      resumeAction={resumeAction}
      retryAction={retryAction}
      statusFacts={statusFacts}
      workerStatus={workerStatus}
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
  syncPlan?: SearchSyncPreflightPlan;
  view: Promise<SearchInsightsFirstView>;
}>) {
  const data = await view;
  return (
    <SearchInsightsBody
      ga4Card={
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
        ) : undefined
      }
      importState={importState}
      loadRowsAction={loadRowsAction}
      period={period}
      projectId={projectId}
      property={property}
      view={data}
    />
  );
}
