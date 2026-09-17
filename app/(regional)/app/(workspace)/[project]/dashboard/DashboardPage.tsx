import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { OverviewDashboardView } from "@/components/overview/OverviewDashboardView";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getOverview, parseOverviewFilters } from "@/lib/queries/overview";
import { getOverviewCompetitors } from "@/lib/queries/overview-competitors";
import { Suspense } from "react";

type OverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function OverviewData({
  filters,
  isSample,
  projectRef,
}: Readonly<{
  filters: ReturnType<typeof parseOverviewFilters>;
  isSample: boolean;
  projectRef: import("@/lib/routing/app-path").ProjectRef;
}>) {
  const now = new Date();
  const [overview, checkHealth, readable, competitors] = await Promise.all([
    getOverview(projectRef, { filters }),
    getCheckHealth(projectRef, { now }),
    requireReadableProject(projectRef),
    isSample ? Promise.resolve(null) : getOverviewCompetitors(projectRef, filters, now),
  ]);
  const state = overview.state ?? (overview.isEmpty ? "empty" : "populated");
  const role = getProjectRole(readable.actor, readable.project.id);

  return (
    <OverviewDashboardView
      competitors={competitors}
      canCreateKeyword={canProjectAction(role, "create", "keyword")}
      canManageProviders={canProjectAction(role, "manage", "provider_connection")}
      canRunChecks={canProjectAction(role, "update", "keyword")}
      checkHealth={checkHealth}
      isSample={isSample}
      overview={{ ...overview, state }}
    />
  );
}

export default async function DashboardPage({
  params: routeParams,
  searchParams,
}: Readonly<OverviewPageProps>) {
  const { project } = await routeParams;
  const [{ isSample, publicId }, search, runtime] = await Promise.all([
    resolveProjectAccess(project),
    searchParams,
    resolveRegionalDocumentLocale(),
  ]);
  const filters = parseOverviewFilters(search);
  const messages = await loadCoreMessages(runtime.locale, ["shared", "projectDashboard"]);

  return (
    <PageContent>
      <FeatureMessagesProvider
        locale={runtime.locale}
        messages={messages}
        timeZone={runtime.timeZone}
      >
        <Suspense fallback={<OverviewSkeleton />}>
          <OverviewData filters={filters} isSample={isSample} projectRef={publicId} />
        </Suspense>
      </FeatureMessagesProvider>
    </PageContent>
  );
}
