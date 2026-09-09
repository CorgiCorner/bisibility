import { MarketsPageContent } from "@/components/markets/page/MarketsPageContent";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywords } from "@/lib/actions/keyword";
import { createProjectMarket } from "@/lib/actions/project-market-create";
import {
  removeProjectMarketFromProject,
  restoreProjectMarketFromProject,
  setProjectMarketEnabled,
  updateProjectMarket,
} from "@/lib/actions/project-market-lifecycle";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject } from "@/lib/queries/_auth";
import { getArchivedProjectMarkets, getProjectMarkets } from "@/lib/queries/project-markets";

type MarketsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<{ "new-market"?: string | string[] }>;
};

export default async function MarketsPage({ params, searchParams }: Readonly<MarketsPageProps>) {
  const { project: projectRef } = await params;
  const pageSearchParams = await searchParams;
  const [access, markets, archivedMarkets] = await Promise.all([
    requireReadableProject(projectRef),
    getProjectMarkets(projectRef),
    getArchivedProjectMarkets(projectRef),
  ]);
  const role = getProjectRole(access.actor, access.project.id);
  const writable = access.project.writeMode === "active";
  const canEdit = writable && canProjectAction(role, "update", "project_market");
  const canArchive = writable && canProjectAction(role, "update", "project_market");
  const canAddKeywords = writable && canProjectAction(role, "create", "keyword");
  const canCreateMarket = writable && canProjectAction(role, "create", "project_market");
  const canRestore = writable && canProjectAction(role, "delete", "project_market");

  return (
    <PageContent variant="analytics">
      <MarketsPageContent
        addKeywordsAction={addKeywords}
        archivedMarkets={archivedMarkets}
        canAddKeywords={canAddKeywords}
        canCreateMarket={canCreateMarket}
        canArchive={canArchive}
        canEdit={canEdit}
        canRestore={canRestore}
        createMarketAction={createProjectMarket}
        markets={markets}
        onArchive={removeProjectMarketFromProject}
        onRestore={restoreProjectMarketFromProject}
        onSave={updateProjectMarket}
        onStatusChange={setProjectMarketEnabled}
        openNewMarket={pageSearchParams?.["new-market"] === "1"}
      />
    </PageContent>
  );
}
