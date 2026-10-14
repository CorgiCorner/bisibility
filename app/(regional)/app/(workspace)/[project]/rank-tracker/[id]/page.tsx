import { KeywordDetailHistory } from "@/components/keyword-detail-history/KeywordDetailHistory";
import { KeywordManagementMessagesBoundary } from "@/components/keywords/add/KeywordManagementMessagesBoundary";
import { KeywordDataRefresh } from "@/components/keywords/KeywordDataRefresh";
import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { RetrievedResultsCard } from "@/components/keywords/RetrievedResultsCard";
import { loadRankTrackerCostContext } from "@/components/keywords/rank-tracker-cost-context";
import { PageContent } from "@/components/shell/PageContent";
import { BackLink } from "@/components/ui/BackLink";
import { Card } from "@/components/ui/Card";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { createIntlTranslator } from "@/i18n/translator.server";
import { createKeywordAlertRule } from "@/lib/actions/alerts";
import { extendSerpSnapshot } from "@/lib/actions/extend-snapshot";
import { updateKeyword } from "@/lib/actions/keyword";
import { runCheckNow } from "@/lib/actions/rankCheck";
import { loadRetrievedResults } from "@/lib/actions/retrieved-results";
import { syncProjectTraffic } from "@/lib/actions/traffic-sync";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { providerLabel } from "@/lib/checks/attempts";
import { keywordDetailRankState } from "@/lib/keyword-detail/quality-projector";
import { deriveKeywordDetailState } from "@/lib/keyword-detail/state-model";
import { rankTrackerDetailReturnHref } from "@/lib/keywords/rank-tracker-detail-navigation";
import type { NextSearchParams } from "@/lib/keywords/rank-tracker-query";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getKeywordCompetitors } from "@/lib/queries/competitor-policies";
import {
  loadKeywordDetailHistoryWindow,
  loadKeywordHistoryPage,
  loadKeywordHistorySnapshot,
  refreshKeywordHistoryWindow,
} from "@/lib/queries/keyword-detail-history";
import { getKeywordTargetContext } from "@/lib/queries/keyword-target-context";
import { getKeywordDetail, getKeywordTagSuggestions } from "@/lib/queries/keywords";
import { loadRetrievedResultsForChecks, storedResultsIndex } from "@/lib/queries/retrieved-results";
import { getRankCheckRawRetentionDays } from "@/lib/rank-check/raw-retention";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { keywordHistoryWindows } from "@/lib/rank-reports/history-calendar";
import { notFound } from "next/navigation";

type KeywordDetailPageProps = {
  params: Promise<{ id: string; project: string }>;
  searchParams?: Promise<NextSearchParams>;
};

export default async function KeywordDetailPage({
  params,
  searchParams,
}: Readonly<KeywordDetailPageProps>) {
  const { id, project } = await params;
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["projectRankTracker"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const { publicId } = await resolveProjectAccess(project);
  const returnHref = rankTrackerDetailReturnHref(publicId, (await searchParams) ?? {});
  const [keywordMetadata, tagSuggestions, readable, costContext, targetContext, competitors] =
    await Promise.all([
      getKeywordDetail(publicId, id),
      getKeywordTagSuggestions(publicId),
      requireReadableProject(publicId),
      loadRankTrackerCostContext(publicId),
      getKeywordTargetContext(publicId, id),
      getKeywordCompetitors(publicId, id),
    ]);

  if (!keywordMetadata) {
    notFound();
  }
  const historyTimeZone = costContext?.timezone ?? runtime.timeZone;
  const historyScope = {
    projectId: publicId,
    keywordId: id,
    windows: keywordHistoryWindows(new Date(), historyTimeZone),
  };
  let initial: Awaited<
    ReturnType<typeof loadKeywordDetailHistoryWindow<NonNullable<typeof keywordMetadata>>>
  >;
  try {
    initial = await loadKeywordDetailHistoryWindow(
      historyScope,
      historyScope.windows[1].window,
      keywordMetadata,
    );
  } catch (error) {
    if (
      !(error instanceof RankReportCapacityError) &&
      !(error instanceof RankReportSnapshotConflictError)
    )
      throw error;
    return (
      <KeywordManagementMessagesBoundary>
        <PageContent className="grid gap-4">
          <BackLink href={returnHref}>
            {t("projectRankTracker.keywordDetail.navigation.allKeywords")}
          </BackLink>
          <Card component="section" className="min-w-0 px-5 py-4.5" size="md">
            <h2 className="text-base font-semibold">
              {t("projectRankTracker.keywordDetail.quality.reportUnavailable")}
            </h2>
            <p role="status" className="mb-4 mt-2 text-sm text-fg-muted">
              {t(
                error instanceof RankReportCapacityError
                  ? "projectRankTracker.keywordDetail.quality.reportCapacity"
                  : "projectRankTracker.keywordDetail.quality.reportChanged",
              )}
            </p>
            <KeywordDataRefresh />
          </Card>
        </PageContent>
      </KeywordManagementMessagesBoundary>
    );
  }
  const { keyword, quality } = initial;
  const { projectMarkets, targets: marketTargets } = targetContext;
  const storedChecks = await storedResultsIndex({
    keywordPublicId: id,
    projectId: readable.project.id,
  });
  // The card has no mount effect, so the newest check is loaded here rather than leaving
  // the body claiming it is loading while nothing is in flight.
  const [newestResults = null] = storedChecks[0]
    ? await loadRetrievedResultsForChecks({
        checkIds: [storedChecks[0].checkId],
        projectId: readable.project.id,
      })
    : [];
  const role = getProjectRole(readable.actor, readable.project.id);
  const canUpdateKeyword = canProjectAction(role, "update", "keyword");
  const canSyncTraffic = canProjectAction(role, "update", "project");
  // Unrelated traffic connection state keeps its existing adapter; rank state comes from the shared snapshot.
  const trafficState = deriveKeywordDetailState(keyword, keyword.traffic).trafficState;
  const rankState = keywordDetailRankState(quality);
  const checkProviderLabel = providerLabel(
    costContext?.providerId ?? keyword.dataProvider ?? "unknown",
  );

  const backLink = (
    <BackLink href={returnHref}>
      {t("projectRankTracker.keywordDetail.navigation.allKeywords")}
    </BackLink>
  );
  const retrievedResultsCard = (
    <RetrievedResultsCard
      key={`${newestResults?.checkId}:${newestResults?.tier === "full" ? `${newestResults.extension?.reason}:${newestResults.extension?.nextStart}:${newestResults.extension?.pages.at(-1)?.fetchedAt}` : newestResults?.tier}`}
      projectRef={publicId}
      extendSnapshotAction={canUpdateKeyword ? extendSerpSnapshot : undefined}
      competitors={competitors}
      ownDomain={readable.project.domain ?? ""}
      entries={storedChecks}
      initialResults={newestResults}
      keyword={keyword}
      loadResults={async (checkIds) => {
        "use server";
        return loadRetrievedResults({ checkIds, projectId: publicId });
      }}
      retentionDays={getRankCheckRawRetentionDays()}
      timeZone={costContext?.timezone ?? "UTC"}
    />
  );

  const positionHistory = (
    <KeywordDetailHistory
      keyword={keyword.keyword}
      timeZone={historyTimeZone}
      history={{
        initial: initial.history,
        windows: historyScope.windows,
        readPage: async (input) => {
          "use server";
          return loadKeywordHistoryPage(historyScope, input);
        },
        readWindow: async (window) => {
          "use server";
          return refreshKeywordHistoryWindow(historyScope, window);
        },
        readSnapshot: async (input) => {
          "use server";
          return loadKeywordHistorySnapshot(historyScope, input);
        },
      }}
    />
  );
  if (rankState !== "normal") {
    return (
      <KeywordManagementMessagesBoundary>
        <PageContent className="grid gap-4">
          {backLink}
          <KeywordPendingDetail
            scheduleTargets={marketTargets}
            canUpdateKeyword={canUpdateKeyword}
            costContext={costContext}
            createKeywordAlertAction={createKeywordAlertRule}
            keyword={keyword}
            quality={quality}
            history={positionHistory}
            providerConnected={keyword.providerConnected}
            projectId={publicId}
            projectMarkets={projectMarkets}
            projectRef={publicId}
            providerLabel={checkProviderLabel}
            rankState={rankState}
            runCheckNowAction={runCheckNow}
            searchConsoleConnected={keyword.traffic.hasSearchConsoleConnection}
            updateKeywordAction={updateKeyword}
          />
          {retrievedResultsCard}
          <KeywordTrafficCard
            canSync={canSyncTraffic}
            syncTrafficAction={syncProjectTraffic}
            projectRef={publicId}
            traffic={keyword.traffic}
            trafficState={trafficState}
          />
        </PageContent>
      </KeywordManagementMessagesBoundary>
    );
  }

  return (
    <KeywordManagementMessagesBoundary>
      <PageContent className="grid gap-4">
        {backLink}
        <KeywordHeaderCard
          scheduleTargets={marketTargets}
          canUpdateKeyword={canUpdateKeyword}
          costContext={costContext}
          createKeywordAlertAction={createKeywordAlertRule}
          keyword={keyword}
          quality={quality}
          projectId={publicId}
          projectMarkets={projectMarkets}
          providerLabel={checkProviderLabel}
          runCheckNowAction={runCheckNow}
          searchConsoleConnected={keyword.traffic.hasSearchConsoleConnection}
          tagSuggestions={tagSuggestions}
          updateKeywordAction={updateKeyword}
        />
        {positionHistory}
        {retrievedResultsCard}
        <KeywordTrafficCard
          canSync={canSyncTraffic}
          syncTrafficAction={syncProjectTraffic}
          projectRef={publicId}
          traffic={keyword.traffic}
          trafficState={trafficState}
        />
      </PageContent>
    </KeywordManagementMessagesBoundary>
  );
}
