import { CompetitorsWorkspace } from "@/components/competitors/CompetitorsWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywords } from "@/lib/actions/keyword";
import { createSavedView, deleteSavedView } from "@/lib/actions/saved-views";
import { canProjectAction } from "@/lib/auth/capabilities";
import { emptyCompetitorFilter } from "@/lib/competitors/competitor-market-model";
import { parseCompetitorScope } from "@/lib/competitors/scope-model";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { getCompetitorsView } from "@/lib/queries/competitors";
import { getSavedView, listSavedViews } from "@/lib/queries/saved-views";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { notFound } from "next/navigation";

type CompetitorsPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

function paramValue(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export default async function CompetitorsPage({
  params: routeParams,
  searchParams,
}: Readonly<CompetitorsPageProps>) {
  const { project } = await routeParams;
  const access = await resolveProjectAccess(project);
  const workspaces = await listWorkspaces();
  const active = workspaces.find((workspace) => workspace.id === access.publicId);

  if (!active) {
    notFound();
  }

  const search = await searchParams;
  const requestedViewId = paramValue(search?.view) ?? null;
  const [savedViews, activeView] = await Promise.all([
    listSavedViews(active.id, "competitors"),
    getSavedView(active.id, requestedViewId, "competitors"),
  ]);
  const urlScope = parseCompetitorScope({
    device: paramValue(search?.device),
    engine: paramValue(search?.engine),
    locationId: paramValue(search?.location),
  });
  const view = await getCompetitorsView(
    active.id,
    urlScope === undefined ? activeView?.config.scope : urlScope,
  );
  const canCreate = canProjectAction(active.role, "create", "competitor");
  const canDelete = canProjectAction(active.role, "delete", "competitor");
  const canUpdate = canProjectAction(active.role, "update", "competitor");
  const deletableSavedViewIds = savedViews
    .filter((savedView) => savedView.canDelete)
    .map((savedView) => savedView.id);

  return (
    <PageContent>
      <CompetitorsWorkspace
        activeViewId={activeView?.id ?? null}
        addKeywordsAction={
          canProjectAction(active.role, "create", "keyword") ? addKeywords : undefined
        }
        canCreate={canCreate}
        canDelete={canDelete}
        canUpdate={canUpdate}
        createSavedViewAction={
          canProjectAction(active.role, "create", "saved_view") ? createSavedView : undefined
        }
        deletableSavedViewIds={deletableSavedViewIds}
        deleteSavedViewAction={deletableSavedViewIds.length > 0 ? deleteSavedView : undefined}
        initialFilter={activeView?.config.filters ?? emptyCompetitorFilter}
        projectRef={access.publicId}
        savedViews={savedViews}
        view={view}
      />
    </PageContent>
  );
}
