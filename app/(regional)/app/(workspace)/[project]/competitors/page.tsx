import { CompetitorsMessagesBoundary } from "@/components/competitors/CompetitorsMessagesBoundary";
import { CompetitorsWorkspace } from "@/components/competitors/CompetitorsWorkspace";
import { PageContent } from "@/components/shell/PageContent";
import { addKeywords } from "@/lib/actions/keyword";
import { canProjectAction } from "@/lib/auth/capabilities";
import { emptyCompetitorFilter } from "@/lib/competitors/competitor-market-model";
import { parseCompetitorScope } from "@/lib/competitors/scope-model";
import { resolveProjectAccess } from "@/lib/queries/_auth";
import { loadCompetitorPersonalContext } from "@/lib/queries/competitor-personal-context";
import { getCompetitorsView } from "@/lib/queries/competitors";
import { getExperimentalModules } from "@/lib/queries/experimental-modules";
import { getProjectMarkets } from "@/lib/queries/project-markets";
import { listWorkspaces } from "@/lib/queries/workspaces";
import { hasExperimentalModule } from "@/lib/settings/experimental-modules";
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
  const enabledExperimentalModules = await getExperimentalModules(access.publicId);
  if (!hasExperimentalModule(enabledExperimentalModules, "competitors")) {
    notFound();
  }
  const workspaces = await listWorkspaces();
  const active = workspaces.find((workspace) => workspace.id === access.publicId);

  if (!active) {
    notFound();
  }

  const search = await searchParams;
  const [context, projectMarkets] = await Promise.all([
    loadCompetitorPersonalContext(active.id, search ?? {}),
    getProjectMarkets(active.id),
  ]);
  const activeView = context.activeView;
  const urlScope = parseCompetitorScope({
    device: paramValue(search?.device),
    engine: paramValue(search?.engine),
    locationId: paramValue(search?.location),
  });
  const view = await getCompetitorsView(
    active.id,
    context.unavailable ? null : urlScope === undefined ? activeView?.config.scope : urlScope,
  );
  const canCreate = canProjectAction(active.role, "create", "competitor");
  const canDelete = canProjectAction(active.role, "delete", "competitor");
  const canUpdate = canProjectAction(active.role, "update", "competitor");

  return (
    <PageContent>
      <CompetitorsMessagesBoundary>
        <CompetitorsWorkspace
          activeViewId={activeView?.id ?? (context.unavailable ? context.requestedViewId : null)}
          addKeywordsAction={
            canProjectAction(active.role, "create", "keyword") ? addKeywords : undefined
          }
          canCreate={canCreate}
          canDelete={canDelete}
          canUpdate={canUpdate}
          deletableSavedViewIds={[]}
          personalViews={context.personal}
          canCreateSharedView={canProjectAction(active.role, "create", "saved_view")}
          initialFilter={activeView?.config.filters ?? emptyCompetitorFilter}
          projectRef={access.publicId}
          projectMarkets={projectMarkets}
          savedViews={[]}
          view={view}
        />
      </CompetitorsMessagesBoundary>
    </PageContent>
  );
}
