import { KeywordHeaderCard } from "@/components/keywords/KeywordHeaderCard";
import { KeywordMetricCards } from "@/components/keywords/KeywordMetricCards";
import { KeywordPendingDetail } from "@/components/keywords/KeywordPendingDetail";
import { KeywordTrafficCard } from "@/components/keywords/KeywordTrafficCard";
import { PositionHistoryCard } from "@/components/keywords/PositionHistoryCard";
import { RankingUrlHistory } from "@/components/keywords/RankingUrlHistory";
import { PageContent } from "@/components/shell/PageContent";
import { createKeywordAlertRule } from "@/lib/actions/alerts";
import { addKeywords, updateKeyword } from "@/lib/actions/keyword";
import { bulkDeleteKeywords } from "@/lib/actions/keyword-bulk";
import { updateKeywordSchedule } from "@/lib/actions/keyword-schedule";
import { runCheckNow } from "@/lib/actions/rankCheck";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
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
  const canDeleteKeyword = canProjectAction(role, "delete", "keyword");
  const canManageProviders = canProjectAction(role, "manage", "provider_connection");
  const canUpdateKeyword = canProjectAction(role, "update", "keyword");

  const backLink = (
    <Link
      className="inline-flex w-fit items-center gap-2 font-mono text-[12.5px] text-fg-muted hover:text-accent-text"
      href={appPath(projectRef, "keywords")}
    >
      <ArrowLeft size={14} weight="bold" />
      All keywords
    </Link>
  );

  // A keyword without a positive rank has no chart or ranking URL history to plot. The status
  // detail distinguishes an unattempted check from running, failed, and unranked attempts.
  if (!keyword.hasRankData && keyword.checkState !== "ranked") {
    return (
      <PageContent className="grid gap-4">
        {backLink}
        <KeywordPendingDetail
          bulkDeleteAction={bulkDeleteKeywords}
          canDeleteKeyword={canDeleteKeyword}
          canManageProviders={canManageProviders}
          canUpdateKeyword={canUpdateKeyword}
          costContext={costContext}
          keyword={keyword}
          providerConnected={keyword.providerConnected}
          projectId={publicId}
          projectRef={publicId}
          runCheckNowAction={runCheckNow}
          updateKeywordAction={updateKeyword}
          updateKeywordScheduleAction={updateKeywordSchedule}
        />
        <KeywordTrafficCard projectRef={publicId} traffic={keyword.traffic} />
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
      <KeywordMetricCards keyword={keyword} />
      <KeywordTrafficCard projectRef={publicId} traffic={keyword.traffic} />
      <PositionHistoryCard keyword={keyword} />
      <RankingUrlHistory keyword={keyword} />
    </PageContent>
  );
}
