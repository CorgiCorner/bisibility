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
import { createSavedView, deleteSavedView } from "@/lib/actions/saved-views";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { providerLabel } from "@/lib/checks/attempts";
import { lensLocationOptions, resolveActiveLens } from "@/lib/keywords/lens-model";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getCheckRunsView, getUpcomingView } from "@/lib/queries/check-runs";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import {
  getKeywordCount,
  getKeywordDefaultMarket,
  getKeywordRows,
  getKeywordTagSuggestions,
  KEYWORD_LIST_MAX,
} from "@/lib/queries/keywords";
import { listSavedKeywords, savedKeywordCount } from "@/lib/queries/saved-keywords";
import { getSavedView, listSavedViews } from "@/lib/queries/saved-views";
import { getRequestSerpProviderChain } from "@/lib/queries/workspace-request-data";

type KeywordsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

async function SavedTab({ projectRef }: Readonly<{ projectRef: string }>) {
  const [saved, savedCount, trackedCount, readable, costContext, keywordDefaults] =
    await Promise.all([
      listSavedKeywords(projectRef),
      savedKeywordCount(projectRef),
      getKeywordCount(projectRef),
      requireReadableProject(projectRef),
      getProjectCostContext(projectRef),
      getKeywordDefaultMarket(projectRef),
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
  const [initialRuns, upcoming, providerChain, trackedCount, savedCount] = await Promise.all([
    getCheckRunsView(projectRef, { limit: 50, now, range: "7d", status: "all" }),
    getUpcomingView(projectRef, { now }),
    getRequestSerpProviderChain(projectId),
    getKeywordCount(projectRef),
    savedKeywordCount(projectRef),
  ]);

  return (
    <PageContent>
      <section className="grid min-w-0 gap-4">
        <RankTrackerTabs
          activeTab="checks"
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
  const requestedViewId = paramValue(params?.view) ?? null;
  const openAddDrawer = paramValue(params?.add) === "1";
  const [
    rows,
    savedViews,
    activeView,
    readable,
    checkHealth,
    costContext,
    tagSuggestions,
    keywordDefaults,
    savedCount,
  ] = await Promise.all([
    getKeywordRows(publicId),
    listSavedViews(publicId),
    getSavedView(publicId, requestedViewId),
    requireReadableProject(publicId),
    getCheckHealth(publicId),
    getProjectCostContext(publicId),
    getKeywordTagSuggestions(publicId),
    getKeywordDefaultMarket(publicId),
    savedKeywordCount(publicId),
  ]);
  // Counting only matters when the capped list may be truncated.
  const totalKeywordCount =
    rows.length >= KEYWORD_LIST_MAX ? await getKeywordCount(publicId) : undefined;

  // Unknown or stale location lenses fall back to "all" to avoid an empty grid.
  const requestedLens = resolveActiveLens(
    {
      device: paramValue(params?.device),
      location: paramValue(params?.location),
    },
    rows,
  );
  const knownLocationIds = new Set(lensLocationOptions(rows).map((option) => option.id));
  const lens =
    requestedLens.locationId && !knownLocationIds.has(requestedLens.locationId)
      ? { ...requestedLens, locationId: null }
      : requestedLens;
  // Saved views reset local filters; scope navigation preserves them.
  const gridKey = activeView?.id ?? "all-keywords";
  const role = getProjectRole(readable.actor, readable.project.id);
  const deletableSavedViewIds = savedViews.filter((view) => view.canDelete).map((view) => view.id);

  return (
    <PageContent>
      <section className="grid min-w-0 gap-4">
        <RankTrackerTabs
          activeTab="tracked"
          projectRef={readable.project.publicId}
          savedCount={savedCount}
          trackedCount={totalKeywordCount ?? rows.length}
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
            canProjectAction(role, "create", "saved_view") ? createSavedView : undefined
          }
          costContext={costContext}
          deletableSavedViewIds={deletableSavedViewIds}
          deleteSavedViewAction={deletableSavedViewIds.length > 0 ? deleteSavedView : undefined}
          getFirstCheckRunPlanAction={getFirstCheckRunPlan}
          initialAddOpen={openAddDrawer}
          initialViewConfig={activeView?.config}
          importTopQueriesAction={importTopQueries}
          key={gridKey}
          keywordDefaults={keywordDefaults}
          lens={lens}
          providerConnected={checkHealth.providerConnected}
          projectId={readable.project.publicId}
          queueFirstChecksAction={queueFirstChecks}
          runCheckNowAction={runCheckNow}
          rows={rows}
          savedViews={savedViews}
          tagSuggestions={tagSuggestions}
          totalKeywordCount={totalKeywordCount}
          updateKeywordAction={updateKeyword}
          updateKeywordScheduleAction={updateKeywordSchedule}
        />
      </section>
    </PageContent>
  );
}
