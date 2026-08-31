import {
  SearchInsightsNoDataState,
  SearchInsightsNoPropertyState,
} from "@/components/search-insights/SearchInsightsEmptyStates";
import {
  SearchInsightsBodyLoading,
  SearchInsightsTrustStripLoading,
} from "@/components/search-insights/SearchInsightsLoadingSkeletons";
import { SearchInsightsWorkspace } from "@/components/search-insights/SearchInsightsWorkspace";
import { searchInsightsCurrentReturnPath } from "@/components/search-insights/search-insights-return-path";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywordsMatrix } from "@/lib/actions/keyword";
import {
  cancelGooglePropertySelection,
  completeGooglePropertySelection,
  disconnectGoogleSearchConsole,
} from "@/lib/actions/providers";
import {
  exportSearchInsightsCsv,
  loadSearchInsightsProperties,
  pauseSearchInsightsImport,
  resumeSearchInsightsImport,
  retrySearchInsightsImport,
  selectSearchInsightsProperty,
  syncSearchInsightsNow,
} from "@/lib/actions/search-insights";
import {
  loadSearchInsightsBandList,
  loadSearchInsightsOverlapList,
  loadSearchInsightsPageDetail,
  loadSearchInsightsQueryDetail,
} from "@/lib/actions/search-insights-drawers";
import { loadSearchInsightsRows } from "@/lib/actions/search-insights-rows";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { deploymentMode } from "@/lib/deployment/deployment";
import { getWorkerLivenessDetails } from "@/lib/ops/liveness";
import { compareWorkerTemporalIdentity } from "@/lib/ops/worker-temporal-identity";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getKeywordDefaultMarket } from "@/lib/queries/keywords";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import {
  getSearchInsightsContext,
  loadSearchInsightsScope,
} from "@/lib/search-insights/queries/context";
import { getSearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import { resolveSearchInsightsOauthReturn } from "@/lib/search-insights/queries/oauth-return";
import { loadSearchSyncPreflightPlan } from "@/lib/settings/search-sync-metrics";
import { temporalDeploymentConfig } from "@/lib/temporal/deployment-config";
import { Suspense } from "react";
import {
  SearchInsightsBodySection,
  SearchInsightsTrustStripSection,
} from "./SearchInsightsSections";

type SearchParamValue = string | string[] | undefined;

type SearchInsightsPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    google?: SearchParamValue;
    period?: SearchParamValue;
    property?: SearchParamValue;
    provider?: SearchParamValue;
    reason?: SearchParamValue;
  }>;
};

function first(value: SearchParamValue) {
  return Array.isArray(value) ? value[0] : value;
}

/**
 * What the drawer stack and the Track dialog need. It is read only for a connected property,
 * because that is the only case where the host is mounted at all: an unconnected project renders
 * the empty state and would otherwise pay for four reads nothing displays.
 */
async function searchInsightsDrawerProps(publicId: string, period: string, property: string) {
  const [readable, projectMarkets, defaultMarket, costContext] = await Promise.all([
    requireReadableProject(publicId),
    getProjectMarkets(publicId),
    getKeywordDefaultMarket(publicId),
    getProjectCostContext(publicId),
  ]);
  const role = getProjectRole(readable.actor, readable.project.id);
  return {
    addKeywordsAction: addKeywordsMatrix,
    canCreateKeyword: canProjectAction(role, "create", "keyword"),
    costContext,
    defaultDevice: defaultMarket.device,
    defaultMarketKey: defaultMarket.locationKey,
    loadBandListAction: loadSearchInsightsBandList,
    loadOverlapListAction: loadSearchInsightsOverlapList,
    loadPageDetailAction: loadSearchInsightsPageDetail,
    loadQueryDetailAction: loadSearchInsightsQueryDetail,
    period,
    projectId: publicId,
    property,
    projectMarkets,
  };
}

export default async function SearchInsightsPage({
  params,
  searchParams,
}: Readonly<SearchInsightsPageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const { publicId } = await resolveProjectAccess(project);
  const period = first(query.period);
  // The property, the window and the authorization are resolved once and handed to both reads:
  // the context bar and the first view otherwise repeat every one of them on each render.
  const [scope, oauth, workerLiveness, syncPlan] = await Promise.all([
    loadSearchInsightsScope(publicId, { period, property: first(query.property) }),
    resolveSearchInsightsOauthReturn(publicId, {
      google: first(query.google),
      provider: first(query.provider),
      reason: first(query.reason),
    }),
    getWorkerLivenessDetails(),
    loadSearchSyncPreflightPlan(publicId),
  ]);
  const workerStatus = {
    status: workerLiveness.status,
    temporalIdentityComparison: compareWorkerTemporalIdentity(
      temporalDeploymentConfig(),
      workerLiveness,
    ),
  };
  const connected = Boolean(scope.property);
  const currentReturnPath = searchInsightsCurrentReturnPath(
    `/app/${publicId}/search-console`,
    new URLSearchParams({
      ...(first(query.property) ? { property: first(query.property) as string } : {}),
      ...(period ? { period } : {}),
    }),
  );
  const [context, drawers] = await Promise.all([
    getSearchInsightsContext(publicId, { period, property: first(query.property), scope }),
    connected && scope.property
      ? searchInsightsDrawerProps(publicId, scope.period.id, scope.property)
      : undefined,
  ]);

  // Started, not awaited: the first render must never wait on the sixteen-month import, and
  // both streamed sections read this one result.
  const view = scope.property
    ? getSearchInsightsFirstView(publicId, { period, property: first(query.property), scope })
    : null;

  return (
    <PageContent variant="analytics">
      <SearchInsightsWorkspace
        cancelPropertySelectionAction={cancelGooglePropertySelection}
        completePropertySelectionAction={completeGooglePropertySelection}
        context={context}
        disconnectConnectionAction={disconnectGoogleSearchConsole}
        drawers={drawers}
        exportAction={exportSearchInsightsCsv}
        loadPropertiesAction={loadSearchInsightsProperties}
        oauth={oauth}
        projectDomain={context.projectDomain}
        projectId={publicId}
        selectPropertyAction={selectSearchInsightsProperty}
        syncAction={syncSearchInsightsNow}
        syncPlan={syncPlan}
        trustStrip={
          view ? (
            <Suspense fallback={<SearchInsightsTrustStripLoading />}>
              <SearchInsightsTrustStripSection
                importState={context.importState}
                pauseAction={pauseSearchInsightsImport}
                resumeAction={resumeSearchInsightsImport}
                retryAction={retrySearchInsightsImport}
                projectId={publicId}
                view={view}
                workerStatus={workerStatus}
              />
            </Suspense>
          ) : null
        }
      >
        {view && context.window && scope.property ? (
          <Suspense fallback={<SearchInsightsBodyLoading />}>
            <SearchInsightsBodySection
              cancelAction={cancelGooglePropertySelection}
              completeAction={completeGooglePropertySelection}
              disconnectAction={disconnectGoogleSearchConsole}
              ga4Oauth={oauth.provider === "ga4" ? oauth : undefined}
              importState={context.importState}
              loadRowsAction={loadSearchInsightsRows}
              period={context.period.id}
              projectId={publicId}
              property={scope.property}
              returnPath={currentReturnPath}
              syncPlan={syncPlan}
              view={view}
            />
          </Suspense>
        ) : null}
        {view && !context.window ? (
          <SearchInsightsNoDataState
            facts={{
              completedDays: context.importState?.completedDays ?? 0,
              connectionStatus: context.connection.status,
              deploymentMode: deploymentMode(),
              firstViewReady: context.importState?.firstViewReady === true,
              lastActivityAt: context.importState?.lastActivityAt,
              pauseStartedAt: context.importState?.pauseStartedAt,
              pausedReason: context.importState?.pausedReason,
              safeError: context.importState?.safeError,
              state: context.importState?.state,
              waiting: context.importState?.waiting,
              workerStatus,
            }}
            pauseAction={pauseSearchInsightsImport}
            projectId={publicId}
            resumeAction={resumeSearchInsightsImport}
            retryAction={retrySearchInsightsImport}
          />
        ) : null}
        {view || oauth.setup ? null : (
          <SearchInsightsNoPropertyState
            projectId={publicId}
            propertyName={context.connection.property?.displayName}
            reauth={context.connection.status === "needs_reauth"}
          />
        )}
      </SearchInsightsWorkspace>
    </PageContent>
  );
}
