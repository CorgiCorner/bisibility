import { KeywordManagementMessagesBoundary } from "@/components/keywords/add/KeywordManagementMessagesBoundary";
import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { RetrievedResultsCard } from "@/components/keywords/RetrievedResultsCard";
import { loadRankTrackerCostContext } from "@/components/keywords/rank-tracker-cost-context";
import { PageContent } from "@/components/shell/PageContent";
import { BackLink } from "@/components/ui/BackLink";
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
import { deriveKeywordDetailState } from "@/lib/keyword-detail/state-model";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getKeywordCompetitors } from "@/lib/queries/competitor-policies";
import { getKeywordTargetContext } from "@/lib/queries/keyword-target-context";
import { getKeywordDetail, getKeywordTagSuggestions } from "@/lib/queries/keywords";
import { loadRetrievedResultsForChecks, storedResultsIndex } from "@/lib/queries/retrieved-results";
import { getRankCheckRawRetentionDays } from "@/lib/rank-check/raw-retention";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { notFound } from "next/navigation";

type KeywordDetailPageProps = {
  params: Promise<{ id: string; project: string }>;
};

export default async function KeywordDetailPage({ params }: Readonly<KeywordDetailPageProps>) {
  const { id, project } = await params;
  const runtime = await resolveRegionalDocumentLocale();
  const messages = await loadCoreMessages(runtime.locale, ["projectRankTracker"]);
  const t = createIntlTranslator(runtime.locale, messages, { timeZone: runtime.timeZone });
  const { publicId } = await resolveProjectAccess(project);
  const projectRef = asProjectRef(publicId);
  const [keyword, tagSuggestions, readable, costContext, targetContext, competitors] =
    await Promise.all([
      getKeywordDetail(publicId, id),
      getKeywordTagSuggestions(publicId),
      requireReadableProject(publicId),
      loadRankTrackerCostContext(publicId),
      getKeywordTargetContext(publicId, id),
      getKeywordCompetitors(publicId, id),
    ]);

  if (!keyword) {
    notFound();
  }
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
  const detailState = deriveKeywordDetailState(keyword, keyword.traffic);
  const checkProviderLabel = providerLabel(
    costContext?.providerId ?? keyword.dataProvider ?? "unknown",
  );

  const backLink = (
    <BackLink href={appPath(projectRef, "rank-tracker")}>
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
      rankingUrl={keyword.rankingUrl ?? null}
      retentionDays={getRankCheckRawRetentionDays()}
      timeZone={costContext?.timezone ?? "UTC"}
    />
  );

  const positionHistory = (
    <PositionHistoryCard
      chartState={detailState.chartState}
      keyword={keyword}
      marketTargets={marketTargets}
      timeZone={costContext?.timezone ?? "UTC"}
    />
  );
  const hasHistoricalPosition = (
    keyword.positionObservations ??
    keyword.positionHistory ??
    []
  ).some((point) => point.position !== null);
  if (detailState.rankState !== "normal") {
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
            history={hasHistoricalPosition ? positionHistory : undefined}
            providerConnected={keyword.providerConnected}
            projectId={publicId}
            projectMarkets={projectMarkets}
            projectRef={publicId}
            providerLabel={checkProviderLabel}
            rankState={detailState.rankState}
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
            trafficState={detailState.trafficState}
          />
          {keyword.rankingUrlHistory?.length ? <RankingUrlHistory keyword={keyword} /> : null}
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
          trafficState={detailState.trafficState}
        />
        <RankingUrlHistory keyword={keyword} />
      </PageContent>
    </KeywordManagementMessagesBoundary>
  );
}
