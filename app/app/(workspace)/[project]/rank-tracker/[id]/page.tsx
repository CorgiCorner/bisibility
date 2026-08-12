import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { KeywordMetricCards } from "@/components/keywords/KeywordMetricCards";
import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { PageContent } from "@/components/shell/PageContent";
import { createKeywordAlertRule } from "@/lib/actions/alerts";
import { addKeywords, updateKeyword } from "@/lib/actions/keyword";
import { updateKeywordSchedule } from "@/lib/actions/keyword-schedule";
import { runCheckNow } from "@/lib/actions/rankCheck";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { deriveKeywordDetailState } from "@/lib/keyword-detail/state-model";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getProjectCostContext } from "@/lib/queries/cost-calculator";
import { getKeywordDetail, getKeywordTagSuggestions } from "@/lib/queries/keywords";
import { appPath, asProjectRef } from "@/lib/routing/app-path";
import { ArrowLeftIcon as ArrowLeft } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { notFound } from "next/navigation";

type KeywordDetailPageProps = {
  params: Promise<{ id: string; project: string }>;
};

export default async function KeywordDetailPage({ params }: Readonly<KeywordDetailPageProps>) {
  const { id, project } = await params;
  const { publicId } = await resolveProjectAccess(project);
  const projectRef = asProjectRef(publicId);
  const [keyword, tagSuggestions, readable, costContext] = await Promise.all([
    getKeywordDetail(publicId, id),
    getKeywordTagSuggestions(publicId),
    requireReadableProject(publicId),
    getProjectCostContext(publicId),
  ]);

  if (!keyword) {
    notFound();
  }
  const role = getProjectRole(readable.actor, readable.project.id);
  const canCreateKeyword = canProjectAction(role, "create", "keyword");
  const canUpdateKeyword = canProjectAction(role, "update", "keyword");
  const detailState = deriveKeywordDetailState(keyword, keyword.traffic);

  const backLink = (
    <Link
      className="inline-flex w-fit items-center gap-2 font-mono text-[12.5px] text-fg-muted hover:text-accent-text"
      href={appPath(projectRef, "rank-tracker")}
    >
      <ArrowLeft size={14} weight="bold" />
      All keywords
    </Link>
  );

  // A keyword without a positive rank has no chart or ranking URL history to plot. The status
  // detail distinguishes an unattempted check from running, failed, and unranked attempts.
  if (detailState.rankState !== "normal") {
    return (
      <PageContent className="grid gap-4">
        {backLink}
        <KeywordPendingDetail
          canUpdateKeyword={canUpdateKeyword}
          costContext={costContext}
          createKeywordAlertAction={createKeywordAlertRule}
          keyword={keyword}
          keywordContext={detailState.keywordContext}
          providerConnected={keyword.providerConnected}
          projectId={publicId}
          projectRef={publicId}
          rankState={detailState.rankState}
          runCheckNowAction={runCheckNow}
          updateKeywordAction={updateKeyword}
          updateKeywordScheduleAction={updateKeywordSchedule}
          whatChanged={detailState.whatChanged}
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
        addKeywordsAction={addKeywords}
        canCreateKeyword={canCreateKeyword}
        canUpdateKeyword={canUpdateKeyword}
        costContext={costContext}
        createKeywordAlertAction={createKeywordAlertRule}
        keyword={keyword}
        projectId={publicId}
        runCheckNowAction={runCheckNow}
        tagSuggestions={tagSuggestions}
        updateKeywordAction={updateKeyword}
        updateKeywordScheduleAction={updateKeywordSchedule}
      />
      <KeywordMetricCards
        chartState={detailState.chartState}
        keyword={keyword}
        keywordContext={detailState.keywordContext}
        whatChanged={detailState.whatChanged}
      />
      <PositionHistoryCard chartState={detailState.chartState} keyword={keyword} />
      <KeywordTrafficCard
        projectRef={publicId}
        traffic={keyword.traffic}
        trafficState={detailState.trafficState}
      />
      <RankingUrlHistory keyword={keyword} />
    </PageContent>
  );
}
