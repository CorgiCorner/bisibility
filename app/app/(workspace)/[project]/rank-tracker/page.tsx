import { KeywordsGrid } from "@/components/keywords/grid/KeywordsGrid";
import { loadRankTrackerCostContext } from "@/components/keywords/rank-tracker-cost-context";
import { SavedKeywordsWorkspace } from "@/components/keywords/saved/SavedKeywordsWorkspace";
import { RankTrackerRunsTab } from "@/components/rank-runs/RankTrackerRunsTab";
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
import { importTopQueries } from "@/lib/actions/keyword-suggest";
import { getFirstCheckRunPlan } from "@/lib/actions/rank-check-preview";
import { queueFirstChecks, runCheckNow } from "@/lib/actions/rankCheck";
import { removeSavedKeywords } from "@/lib/actions/saved-keyword";
import { deleteSavedView } from "@/lib/actions/saved-views";
import { createKeywordSavedView } from "@/lib/actions/saved-views-typed";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { parseRankTrackerAction } from "@/lib/keywords/rank-tracker-command";
import { rankTrackerNavigationHref } from "@/lib/keywords/rank-tracker-navigation";
import { keywordSavedViewConfig } from "@/lib/keywords/saved-view-model";
import { resolveLegacyMarketRef } from "@/lib/markets/market-context";
import { LEGACY_MARKET_PARAM, legacyMarketDestination } from "@/lib/markets/market-routes";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getCheckHealth } from "@/lib/queries/check-health";
import { isProviderConnected } from "@/lib/queries/integrations";
import {
  getKeywordCount,
  getKeywordDefaultMarket,
  getKeywordTagSuggestions,
} from "@/lib/queries/keywords";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import { getRankCheckRunCount } from "@/lib/queries/rank-check-runs";
import { listSavedKeywords, savedKeywordCount } from "@/lib/queries/saved-keywords";
import { listSavedViews } from "@/lib/queries/saved-views";
import { appPath } from "@/lib/routing/app-path";
import { permanentRedirect, redirect } from "next/navigation";
import { loadRankTrackerPageList, resolveRankTrackerPageQuery } from "./rank-tracker-page-data";

type KeywordsPageProps = {
  // `market` is present only when this page is reached through the market route, which is how
  // the legacy lens below knows not to undo the segment.
  params: Promise<{ market?: string; project: string }>;
  rankTrackerPath?: string;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
  marketLocationKey?: string;
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

async function SavedTab({
  projectId,
  projectRef,
}: Readonly<{ projectId: string; projectRef: string }>) {
  const [
    saved,
    savedCount,
    trackedCount,
    runsCount,
    readable,
    costContext,
    keywordDefaults,
    projectMarkets,
  ] = await Promise.all([
    listSavedKeywords(projectRef),
    savedKeywordCount(projectRef),
    getKeywordCount(projectRef),
    getRankCheckRunCount(projectId),
    requireReadableProject(projectRef),
    loadRankTrackerCostContext(projectRef),
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
        initialSavedCount={savedCount}
        projectId={readable.project.publicId}
        projectMarkets={projectMarkets}
        removeSavedKeywordsAction={removeSavedKeywords}
        rows={saved.rows}
        runsCount={runsCount}
        trackedCount={trackedCount}
      />
    </PageContent>
  );
}

export default async function KeywordsPage({
  marketLocationKey,
  params: routeParams,
  rankTrackerPath: routeRankTrackerPath,
  searchParams,
}: Readonly<KeywordsPageProps>) {
  const { market, project } = await routeParams;
  const { projectId, publicId } = await resolveProjectAccess(project);
  const params = await searchParams;
  // `?market=` predates the segment and meant a within-page lens. Promote it to the level it
  // always described, once, and only from the project route it was minted on.
  if (!market && params && LEGACY_MARKET_PARAM in params) {
    const legacyDestination = legacyMarketDestination({
      marketRef: await resolveLegacyMarketRef(projectId, paramValue(params[LEGACY_MARKET_PARAM])),
      projectRef: publicId,
      search: urlSearchParams(params),
    });
    if (legacyDestination) {
      permanentRedirect(legacyDestination);
    }
  }
  if (paramValue(params?.tab) === "checks") {
    const redirectParams = urlSearchParams(params ?? {});
    redirectParams.set("tab", "runs");
    redirect(`${appPath(publicId, "rank-tracker")}?${redirectParams.toString()}`);
  }
  if (paramValue(params?.tab) === "saved") {
    return SavedTab({ projectId, projectRef: publicId });
  }
  if (paramValue(params?.tab) === "runs") {
    return RankTrackerRunsTab({ projectId, projectRef: publicId });
  }
  const openAddDrawer = paramValue(params?.add) === "1";
  // A notification links to one run. The value is echoed into the page, so it is narrowed here:
  // anything that is not a rank-check run id names no run and gets no status row.
  const runParam = paramValue(params?.run);
  const deepLinkRunId = runParam && isPublicIdOfType(runParam, "rcr") ? runParam : null;
  const requestedAction = parseRankTrackerAction(paramValue(params?.action));
  const {
    activeView,
    malformedDevice,
    query: requestedQuery,
    staleView,
  } = await resolveRankTrackerPageQuery(publicId, params ?? {});
  const scopedQuery = marketLocationKey
    ? {
        ...requestedQuery,
        lens: { ...requestedQuery.lens, locationId: marketLocationKey },
      }
    : requestedQuery;
  const [
    list,
    savedViews,
    readable,
    checkHealth,
    runsCount,
    costContext,
    tagSuggestions,
    keywordDefaults,
    savedCount,
    projectMarkets,
    preferences,
    searchConsoleConnected,
  ] = await Promise.all([
    loadRankTrackerPageList(publicId, scopedQuery),
    listSavedViews(publicId),
    requireReadableProject(publicId),
    getCheckHealth(publicId),
    getRankCheckRunCount(projectId),
    loadRankTrackerCostContext(publicId),
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
    (scopedQuery.lens.device !== list.query.lens.device ||
      scopedQuery.lens.locationId !== list.query.lens.locationId);
  if (malformedDevice || staleView || staleLens || scopedQuery.page !== canonicalPage) {
    const canonicalQuery = {
      ...list.query,
      page: canonicalPage,
      savedViewId: staleView ? null : list.query.savedViewId,
    };
    redirect(
      rankTrackerNavigationHref({
        basePath: routeRankTrackerPath ?? appPath(publicId, "rank-tracker"),
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
          projectRef={readable.project.publicId}
          runsCount={runsCount}
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
          deepLinkRunId={deepLinkRunId}
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
        />
      </section>
    </PageContent>
  );
}
