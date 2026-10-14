import { loadRankTrackerCostContext } from "@/components/keywords/rank-tracker-cost-context";
import { SavedKeywordsWorkspace } from "@/components/keywords/saved/SavedKeywordsWorkspace";
import { RankTrackerFeatureBoundary } from "@/components/rank-tracker/RankTrackerFeatureBoundary";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywords } from "@/lib/actions/keyword";
import { removeSavedKeywords } from "@/lib/actions/saved-keyword";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getKeywordCount, getKeywordDefaultMarket } from "@/lib/queries/keywords";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import { getRankCheckRunCount } from "@/lib/queries/rank-check-runs";
import { listSavedKeywords, savedKeywordCount } from "@/lib/queries/saved-keywords";

export async function SavedTab({
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
      <RankTrackerFeatureBoundary>
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
      </RankTrackerFeatureBoundary>
    </PageContent>
  );
}
