import { SearchInsightsNoPropertyState } from "@/components/search-insights/SearchInsightsEmptyStates";
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
  loadSearchInsightsTrackDialog,
} from "@/lib/actions/search-insights-drawers";
import { loadSearchInsightsRows } from "@/lib/actions/search-insights-rows";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import {
  getSearchInsightsContext,
  loadSearchInsightsScope,
} from "@/lib/search-insights/queries/context";
import {
  getSearchInsightsFirstView,
  getSearchInsightsFirstViewSignals,
} from "@/lib/search-insights/queries/first-view";
import { resolveSearchInsightsOauthReturn } from "@/lib/search-insights/queries/oauth-return";
import { createRenderPhaseRecorder } from "@/lib/search-insights/render-phases";
import { loadSearchInsightsStatus } from "@/lib/search-insights/status-facts";
import { loadSearchSyncPreflightPlan } from "@/lib/settings/search-sync-metrics";
import { Suspense } from "react";
import {
  SearchInsightsBodySection,
  SearchInsightsNoDataSection,
  SearchInsightsTrustStripSection,
} from "./SearchInsightsSections";

type SearchParamValue = string | string[] | undefined;

type SearchInsightsPageProps = {
  params: Promise<{ project: string }>;
  searchParams: Promise<{
    comparison?: SearchParamValue;
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

export default async function SearchInsightsPage({
  params,
  searchParams,
}: Readonly<SearchInsightsPageProps>) {
  const [{ project }, query] = await Promise.all([params, searchParams]);
  const { publicId } = await resolveProjectAccess(project);
  const comparison = first(query.comparison);
  const period = first(query.period);
  // Every latency figure this module has was measured per statement on a container shaped like the
  // production instance class. That sums the database cost and cannot see the function cold start,
  // the round trips or the render, which is the difference between a budget and what a user waits
  // for. The page reports its own phases instead, on a fraction of renders.
  const phases = createRenderPhaseRecorder({ period: period ?? "default", projectId: publicId });
  // The property, the window and the authorization are resolved once and handed to both reads:
  // the context bar and the first view otherwise repeat every one of them on each render.
  const [scope, oauth, syncPlan, readable] = await phases.measure("prefix", () =>
    Promise.all([
      phases.measure("scope", () =>
        loadSearchInsightsScope(publicId, {
          comparison,
          period,
          property: first(query.property),
        }),
      ),
      phases.measure("oauth", () =>
        resolveSearchInsightsOauthReturn(publicId, {
          google: first(query.google),
          provider: first(query.provider),
          reason: first(query.reason),
        }),
      ),
      phases.measure("syncPlan", () => loadSearchSyncPreflightPlan(publicId)),
      phases.measure("authorize", () => requireReadableProject(publicId)),
    ]),
  );
  const role = getProjectRole(readable.actor, readable.project.id);
  const canCreateKeyword = canProjectAction(role, "create", "keyword");
  // Started once from the same authorized scope and not awaited: the strip and body share the
  // view, while the chips resolve independently without repeating any stored-row lane.
  const view = scope.property
    ? getSearchInsightsFirstView(publicId, {
        comparison,
        period,
        property: first(query.property),
        scope,
      })
    : null;
  const signals = scope.property ? getSearchInsightsFirstViewSignals(scope) : null;
  // Every promise started here is consumed inside a Suspense boundary that may never render, and
  // the awaits below can lose the race to a rejection. `void x.catch()` marks the original handled
  // without settling it, so the section that awaits it later still sees the rejection, and Node
  // does not report an unhandled one when no section renders at all.
  void view?.catch(() => undefined);
  // The body turns rejection into an honest chip state after the view resolves. Mark the raw
  // promise handled immediately too, in case the signal read fails before that section starts.
  void signals?.catch(() => undefined);
  const connected = Boolean(scope.property);
  const currentReturnPath = searchInsightsCurrentReturnPath(
    `/app/${publicId}/search-console`,
    new URLSearchParams({
      ...(first(query.property) ? { property: first(query.property) as string } : {}),
      ...(period ? { period } : {}),
      ...(comparison ? { comparison } : {}),
    }),
  );
  const context = await phases.measure("context", () =>
    getSearchInsightsContext(publicId, {
      comparison,
      period,
      property: first(query.property),
      scope,
    }),
  );
  const drawers =
    connected && scope.property
      ? {
          addKeywordsAction: addKeywordsMatrix,
          canCreateKeyword,
          ...(comparison ? { comparison } : {}),
          loadBandListAction: loadSearchInsightsBandList,
          loadOverlapListAction: loadSearchInsightsOverlapList,
          loadPageDetailAction: loadSearchInsightsPageDetail,
          loadQueryDetailAction: loadSearchInsightsQueryDetail,
          loadTrackDialogAction: loadSearchInsightsTrackDialog,
          period: scope.period.id,
          projectId: publicId,
          property: scope.property,
        }
      : undefined;
  const viewKey = `${publicId}:${scope.property}:${context.period.id}:${context.period.comparison}:${context.window?.current.end}`;
  const status = loadSearchInsightsStatus(context, scope);
  // Both consumers of this one sit in conditional JSX: the trust strip renders only with a view,
  // and the no-data state only without a window. Neither renders for a project with no property,
  // so the promise needs the same handled mark as the two above.
  void status.catch(() => undefined);

  // The prefix ends here: everything below streams. Reporting at this point is what makes the
  // number comparable to the 400 ms the shell, the context bar and the skeletons have to meet.
  phases.report();

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
            <Suspense key={viewKey} fallback={<SearchInsightsTrustStripLoading />}>
              <SearchInsightsTrustStripSection
                importState={context.importState}
                pauseAction={pauseSearchInsightsImport}
                resumeAction={resumeSearchInsightsImport}
                retryAction={retrySearchInsightsImport}
                projectId={publicId}
                status={status}
                view={view}
              />
            </Suspense>
          ) : null
        }
      >
        {view && signals && context.window && scope.property ? (
          <Suspense key={viewKey} fallback={<SearchInsightsBodyLoading />}>
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
              signals={signals}
              syncPlan={syncPlan}
              view={view}
            />
          </Suspense>
        ) : null}
        {view && !context.window ? (
          <Suspense key={viewKey} fallback={<SearchInsightsBodyLoading />}>
            <SearchInsightsNoDataSection
              pauseAction={pauseSearchInsightsImport}
              projectId={publicId}
              resumeAction={resumeSearchInsightsImport}
              retryAction={retrySearchInsightsImport}
              status={status}
            />
          </Suspense>
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
