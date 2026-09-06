import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { RetrievedResultsCard } from "@/components/keywords/RetrievedResultsCard";
import { loadRankTrackerCostContext } from "@/components/keywords/rank-tracker-cost-context";
import { PageContent } from "@/components/shell/PageContent";
import { BackLink } from "@/components/ui";
import { createKeywordAlertRule } from "@/lib/actions/alerts";
import { addKeywordsMatrix, updateKeyword } from "@/lib/actions/keyword";
import { bulkDeleteKeywords } from "@/lib/actions/keyword-bulk";
import { runCheckNow } from "@/lib/actions/rankCheck";
import { loadRetrievedResults } from "@/lib/actions/retrieved-results";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { providerLabel } from "@/lib/checks/attempts";
import { deriveKeywordDetailState } from "@/lib/keyword-detail/state-model";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getKeywordMarketTargets } from "@/lib/queries/keyword-market-targets";
import { getKeywordDetail, getKeywordTagSuggestions } from "@/lib/queries/keywords";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import { loadRetrievedResultsForChecks, storedResultsIndex } from "@/lib/queries/retrieved-results";
import { getRankCheckRawRetentionDays } from "@/lib/rank-check/raw-retention";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { notFound } from "next/navigation";

type KeywordDetailPageProps = {
  params: Promise<{ id: string; project: string }>;
};

export default async function KeywordDetailPage({ params }: Readonly<KeywordDetailPageProps>) {
  const { id, project } = await params;
  const { publicId } = await resolveProjectAccess(project);
  const projectRef = asProjectRef(publicId);
  const [keyword, tagSuggestions, readable, costContext, projectMarkets] = await Promise.all([
    getKeywordDetail(publicId, id),
    getKeywordTagSuggestions(publicId),
    requireReadableProject(publicId),
    loadRankTrackerCostContext(publicId),
    getProjectMarkets(publicId),
  ]);

  if (!keyword) {
    notFound();
  }
  const marketTargets = await getKeywordMarketTargets(publicId, keyword.id);
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
  const canCreateKeyword = canProjectAction(role, "create", "keyword");
  const canUpdateKeyword = canProjectAction(role, "update", "keyword");
  const detailState = deriveKeywordDetailState(keyword, keyword.traffic);
  const checkProviderLabel = providerLabel(
    costContext?.providerId ?? keyword.dataProvider ?? "unknown",
  );

  const backLink = <BackLink href={appPath(projectRef, "rank-tracker")}>All keywords</BackLink>;

  // A keyword without a positive rank has no chart or ranking URL history to plot. The status
  // detail distinguishes an unattempted check from running, failed, and unranked attempts.
  if (detailState.rankState !== "normal") {
    return (
      <PageContent className="grid gap-4">
        {backLink}
        <KeywordPendingDetail
          addKeywordsMatrixAction={addKeywordsMatrix}
          bulkDeleteAction={bulkDeleteKeywords}
          canCreateKeyword={canCreateKeyword}
          canUpdateKeyword={canUpdateKeyword}
          costContext={costContext}
          createKeywordAlertAction={createKeywordAlertRule}
          keyword={keyword}
          providerConnected={keyword.providerConnected}
          projectId={publicId}
          projectMarkets={projectMarkets}
          projectRef={publicId}
          providerLabel={checkProviderLabel}
          rankState={detailState.rankState}
          runCheckNowAction={runCheckNow}
          searchConsoleConnected={keyword.traffic.hasSearchConsoleConnection}
          updateKeywordAction={updateKeyword}
          targets={marketTargets}
        />
        <KeywordTrafficCard
          projectRef={publicId}
          traffic={keyword.traffic}
          trafficState={detailState.trafficState}
        />
      </PageContent>
    );
  }

  return (
    <PageContent className="grid gap-4">
      {backLink}
      <KeywordHeaderCard
        addKeywordsMatrixAction={addKeywordsMatrix}
        bulkDeleteAction={bulkDeleteKeywords}
        canCreateKeyword={canCreateKeyword}
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
        targets={marketTargets}
        updateKeywordAction={updateKeyword}
      />
      <PositionHistoryCard
        chartState={detailState.chartState}
        keyword={keyword}
        marketTargets={marketTargets}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      <KeywordTrafficCard
        projectRef={publicId}
        traffic={keyword.traffic}
        trafficState={detailState.trafficState}
      />
      <RetrievedResultsCard
        entries={storedChecks}
        initialResults={newestResults}
        loadResults={async (checkIds) => {
          "use server";
          return loadRetrievedResults({ checkIds, projectId: publicId });
        }}
        rankingUrl={keyword.rankingUrl ?? null}
        retentionDays={getRankCheckRawRetentionDays()}
        timeZone={costContext?.timezone ?? "UTC"}
      />
      <RankingUrlHistory keyword={keyword} />
    </PageContent>
  );
}
