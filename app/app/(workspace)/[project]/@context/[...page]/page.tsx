import { KeywordHeaderContext } from "@/components/keywords/KeywordHeaderContext";
import { RankTrackerHeaderContext } from "@/components/keywords/RankTrackerHeaderContext";
import { OverviewHeaderContext } from "@/components/overview/OverviewHeaderContext";
import { HeaderContextSlot } from "@/components/shell/HeaderContextSlot";
import { addKeywordsMatrix } from "@/lib/actions/keyword";
import { bulkDeleteKeywords } from "@/lib/actions/keyword-bulk";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { parsePublicId } from "@/lib/db/public-id";
import { type NextSearchParams, parseRankTrackerQuery } from "@/lib/keywords/rank-tracker-query";
import { hasMarketRoute, sectionPathOf } from "@/lib/markets/market-route-sections";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listHeaderMarkets } from "@/lib/queries/header-markets";
import { getKeywordTargetContext } from "@/lib/queries/keyword-target-context";
import { listOverviewHeaderMarkets } from "@/lib/queries/overview-header-markets";
import { getSavedView } from "@/lib/queries/saved-views";

export default async function ProjectHeaderContext({
  params,
  searchParams,
}: Readonly<{
  params: Promise<{ page: string[]; project: string }>;
  searchParams?: Promise<NextSearchParams>;
}>) {
  const { page, project } = await params;
  if (page.length === 2 && page[0] === "rank-tracker" && parsePublicId(page[1])?.prefix === "kw") {
    const access = await resolveProjectAccess(project);
    const [{ projectMarkets, targets }, readable] = await Promise.all([
      getKeywordTargetContext(access.publicId, page[1]),
      requireReadableProject(access.publicId),
    ]);
    const keyword = targets.find((target) => target.id === page[1]);
    if (!keyword) return null;
    const role = getProjectRole(readable.actor, readable.project.id);
    return (
      <KeywordHeaderContext
        addKeywordsMatrixAction={addKeywordsMatrix}
        bulkDeleteAction={bulkDeleteKeywords}
        canCreateKeyword={canProjectAction(role, "create", "keyword")}
        canUpdateKeyword={canProjectAction(role, "update", "keyword")}
        key={keyword.id}
        keyword={keyword}
        projectId={access.publicId}
        projectMarkets={projectMarkets}
        targets={targets}
      />
    );
  }
  if (page.length === 1 && page[0] === "dashboard") {
    const options = await listOverviewHeaderMarkets(project);
    return <OverviewHeaderContext options={options} />;
  }
  if (!hasMarketRoute(sectionPathOf(page))) return null;
  const access = await resolveProjectAccess(project);
  const contexts = await listHeaderMarkets(access.publicId);
  const rankTracker = page.length === 1 && page[0] === "rank-tracker";
  const viewId = rankTracker
    ? parseRankTrackerQuery((await searchParams) ?? {}).state.savedViewId
    : null;
  const savedView = viewId ? await getSavedView(access.publicId, viewId) : null;
  return rankTracker ? (
    <RankTrackerHeaderContext
      contexts={contexts}
      projectRef={access.publicId}
      savedView={savedView?.config}
    />
  ) : (
    <HeaderContextSlot contexts={contexts} projectRef={access.publicId} />
  );
}
