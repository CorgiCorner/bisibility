import { ChecksWorkspace } from "@/components/checks/ChecksWorkspace";
import { KeywordsGrid } from "@/components/keywords/grid/KeywordsGrid";
import { SavedKeywordsWorkspace } from "@/components/keywords/saved/SavedKeywordsWorkspace";
import { RankTrackerTabs } from "@/components/rank-tracker/RankTrackerTabs";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywords, updateKeyword } from "@/lib/actions/keyword";
import {
  bulkClearTargetUrls,
  bulkDeleteKeywords,
  bulkSetFrequency,
  bulkSetTargetUrl,
  bulkTagKeywords,
} from "@/lib/actions/keyword-bulk";
import { updateKeywordSchedule } from "@/lib/actions/keyword-schedule";
import { importTopQueries } from "@/lib/actions/keyword-suggest";
import { getFirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { queueFirstChecks, runCheckNow } from "@/lib/actions/rankCheck";
import { removeSavedKeywords } from "@/lib/actions/saved-keyword";
import { deleteSavedView } from "@/lib/actions/saved-views";
import { createKeywordSavedView } from "@/lib/actions/saved-views-typed";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { providerLabel } from "@/lib/checks/attempts";
import { parseRankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import { rankTrackerNavigationHref } from "@/lib/keywords/rank-tracker-navigation";
import { keywordSavedViewConfig } from "@/lib/keywords/saved-view-model";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getCheckRunCount, getCheckRunsView, getUpcomingView } from "@/lib/queries/check-runs";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { isProviderConnected } from "@/lib/queries/integrations";
import {
  getKeywordCount,
  getKeywordDefaultMarket,
  getKeywordTagSuggestions,
} from "@/lib/queries/keywords";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import { listSavedKeywords, savedKeywordCount } from "@/lib/queries/saved-keywords";
import { listSavedViews } from "@/lib/queries/saved-views";
import { getRequestSerpProviderChain } from "@/lib/queries/workspace-request-data";
import { appPath } from "@/lib/routing/app-path";
import { redirect } from "next/navigation";
import { loadRankTrackerPageList, resolveRankTrackerPageQuery } from "./rank-tracker-page-data";

type KeywordsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function urlSearchParams(params: Record<string, string | string[] | undefined>) {
  const result = new URLSearchParams();
  for (const [key, raw] of Object.entries(params)) {
    for (const value of Array.isArray(raw) ? raw : raw === undefined ? [] : [raw]) {
      result.append(key, value);
    }
  }
  return result;
}

async function SavedTab({ projectRef }: Readonly<{ projectRef: string }>) {
  const [
    saved,
    savedCount,
    trackedCount,
    checksCount,
    readable,
    costContext,
    keywordDefaults,
    projectMarkets,
  ] = await Promise.all([
    listSavedKeywords(projectRef),
    savedKeywordCount(projectRef),
    getKeywordCount(projectRef),
    getCheckRunCount(projectRef),
    requireReadableProject(projectRef),
    getProjectCostContext(projectRef),
    getKeywordDefaultMarket(projectRef),
    getProjectMarkets(projectRef),
  ]);
  const role = getProjectRole(readable.actor, readable.project.id);
  return (
    <PageContent>
      <SavedKeywordsWorkspace
        addKeywordsAction={addKeywords}
        canCreateKeyword={canProjectAction(role, "create", "keyword")}
        canDeleteKeyword={canProjectAction(role, "delete", "keyword")}
        costContext={costContext}
        defaultDevice={keywordDefaults.device}
        checksCount={checksCount}
        initialSavedCount={savedCount}
        projectId={readable.project.publicId}
        projectMarkets={projectMarkets}
        removeSavedKeywordsAction={removeSavedKeywords}
        rows={saved.rows}
        trackedCount={trackedCount}
      />
    </PageContent>
  );
}

async function ChecksTab({
  projectId,
  projectRef,
}: Readonly<{ projectId: string; projectRef: string }>) {
  const now = new Date();
  const [initialRuns, upcoming, providerChain, trackedCount, savedCount, checksCount] =
    await Promise.all([
      getCheckRunsView(projectRef, { limit: 50, now, range: "7d", status: "all" }),
      getUpcomingView(projectRef, { now }),
      getRequestSerpProviderChain(projectId),
      getKeywordCount(projectRef),
      savedKeywordCount(projectRef),
      getCheckRunCount(projectRef),
    ]);

  return (
    <PageContent>
      <section className="grid min-w-0 gap-4">
        <RankTrackerTabs
          activeTab="checks"
          checksCount={checksCount}
          projectRef={projectRef}
          savedCount={savedCount}
          trackedCount={trackedCount}
        />
        <ChecksWorkspace
          initialRuns={initialRuns}
          key={`${projectRef}:${now.toISOString()}`}
          now={now.toISOString()}
          projectId={projectRef}
          projectRef={projectRef}
          providerOptions={providerChain.map(({ provider }) => ({
            label: providerLabel(provider),
            value: provider,
          }))}
          upcoming={upcoming}
        />
      </section>
    </PageContent>
  );
}

export default async function KeywordsPage({
  params: routeParams,
  searchParams,
}: Readonly<KeywordsPageProps>) {
  const { project } = await routeParams;
  const { projectId, publicId } = await resolveProjectAccess(project);
  const params = await searchParams;
  if (paramValue(params?.tab) === "saved") {
    return SavedTab({ projectRef: publicId });
  }
  if (paramValue(params?.tab) === "checks") {
    return ChecksTab({ projectId, projectRef: publicId });
  }
  const openAddDrawer = paramValue(params?.add) === "1";
  const requestedAction = parseRankTrackerAction(paramValue(params?.action));
  const {
    activeView,
    malformedDevice,
    query: requestedQuery,
    staleView,
  } = await resolveRankTrackerPageQuery(publicId, params ?? {});
  const [
    list,
    savedViews,
    readable,
    checkHealth,
    checksCount,
    costContext,
    tagSuggestions,
    keywordDefaults,
    savedCount,
    projectMarkets,
    preferences,
    searchConsoleConnected,
  ] = await Promise.all([
    loadRankTrackerPageList(publicId, requestedQuery),
    listSavedViews(publicId),
    requireReadableProject(publicId),
    getCheckHealth(publicId),
    getCheckRunCount(publicId),
    getProjectCostContext(publicId),
    getKeywordTagSuggestions(publicId),
    getKeywordDefaultMarket(publicId),
    savedKeywordCount(publicId),
    getProjectMarkets(publicId),
    getPreferences(),
    isProviderConnected(publicId, "gsc"),
  ]);
  const canonicalPage = list.mode === "flat-server" ? list.page : requestedQuery.page;
  const staleLens =
    list.mode === "flat-server" &&
    (requestedQuery.lens.device !== list.query.lens.device ||
      requestedQuery.lens.locationId !== list.query.lens.locationId);
  if (malformedDevice || staleView || staleLens || requestedQuery.page !== canonicalPage) {
    const canonicalQuery = {
      ...list.query,
      page: canonicalPage,
      savedViewId: staleView ? null : list.query.savedViewId,
    };
    redirect(
      rankTrackerNavigationHref({
        basePath: appPath(publicId, "rank-tracker"),
        current: urlSearchParams(params ?? {}),
        present: ["page"],
        query: canonicalQuery,
      }),
    );
  }
  const query = list.query;
  const gridKey = `${list.mode}:${activeView?.id ?? "all-keywords"}:${query.page}:${query.pageSize}:${query.search}:${query.sort.field}:${query.sort.direction}:${JSON.stringify(query.filters)}:${query.lens.device}:${query.lens.locationId ?? "all"}`;
  const role = getProjectRole(readable.actor, readable.project.id);
  const deletableSavedViewIds = savedViews.filter((view) => view.canDelete).map((view) => view.id);
  const currentViewConfig = keywordSavedViewConfig({
    filters: query.filters,
    lens: query.lens,
    search: query.search,
  });

  return (
    <PageContent>
      <section className="grid min-w-0 gap-4">
        <RankTrackerTabs
          activeTab="tracked"
          checksCount={checksCount}
          projectRef={readable.project.publicId}
          savedCount={savedCount}
          trackedCount={list.totalCount}
        />
        <KeywordsGrid
          activeViewId={activeView?.id ?? null}
          addKeywordsAction={addKeywords}
          bulkClearTargetAction={bulkClearTargetUrls}
          bulkDeleteAction={bulkDeleteKeywords}
          bulkSetFrequencyAction={bulkSetFrequency}
          bulkSetTargetAction={bulkSetTargetUrl}
          bulkTagAction={bulkTagKeywords}
          checkHealth={checkHealth}
          canCreateKeyword={canProjectAction(role, "create", "keyword")}
          canDeleteKeyword={canProjectAction(role, "delete", "keyword")}
          canManageProviders={canProjectAction(role, "manage", "provider_connection")}
          canUpdateKeyword={canProjectAction(role, "update", "keyword")}
          createSavedViewAction={
            canProjectAction(role, "create", "saved_view") ? createKeywordSavedView : undefined
          }
          costContext={costContext}
          deletableSavedViewIds={deletableSavedViewIds}
          deleteSavedViewAction={deletableSavedViewIds.length > 0 ? deleteSavedView : undefined}
          getFirstCheckRunPlanAction={getFirstCheckRunPlan}
          initialAction={requestedAction}
          initialAddOpen={openAddDrawer}
          initialViewConfig={currentViewConfig}
          importTopQueriesAction={importTopQueries}
          initialDensity={preferences.density}
          key={gridKey}
          keywordDefaults={keywordDefaults}
          lens={query.lens}
          providerConnected={checkHealth.providerConnected}
          projectId={readable.project.publicId}
          projectMarkets={projectMarkets}
          searchConsoleConnected={searchConsoleConnected}
          queueFirstChecksAction={queueFirstChecks}
          runCheckNowAction={runCheckNow}
          rows={list.rows}
          savedViews={savedViews}
          tagSuggestions={tagSuggestions}
          facets={list.mode === "flat-server" ? list.facets : undefined}
          listMode={list.mode}
          locations={list.mode === "flat-server" ? list.locations : undefined}
          matchedTargetCount={
            list.mode === "flat-server" ? list.matchedTargetCount : list.rows.length
          }
          page={list.mode === "flat-server" ? list.page : undefined}
          pageCount={list.mode === "flat-server" ? list.pageCount : undefined}
          pageSize={list.mode === "flat-server" ? list.pageSize : undefined}
          query={query}
          totalKeywordCount={list.totalKeywordCount}
          totalCount={list.totalCount}
          updateKeywordAction={updateKeyword}
          updateKeywordScheduleAction={updateKeywordSchedule}
        />
      </section>
    </PageContent>
  );
}
