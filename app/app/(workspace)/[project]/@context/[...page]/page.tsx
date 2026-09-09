import { KeywordHeaderContext } from "@/components/keywords/KeywordHeaderContext";
import { HeaderContextSlot } from "@/components/shell/HeaderContextSlot";
import { addKeywordsMatrix } from "@/lib/actions/keyword";
import { bulkDeleteKeywords } from "@/lib/actions/keyword-bulk";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { parsePublicId } from "@/lib/db/public-id";
import { hasMarketRoute, sectionPathOf } from "@/lib/markets/market-route-sections";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { listHeaderMarkets } from "@/lib/queries/header-markets";
import { getKeywordTargetContext } from "@/lib/queries/keyword-target-context";

export default async function ProjectHeaderContext({
  params,
}: Readonly<{
  params: Promise<{ page: string[]; project: string }>;
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
  if (!hasMarketRoute(sectionPathOf(page))) return null;
  const access = await resolveProjectAccess(project);
  const contexts = await listHeaderMarkets(access.publicId);
  return <HeaderContextSlot contexts={contexts} projectRef={access.publicId} />;
}
