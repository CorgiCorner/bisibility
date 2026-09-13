import { OverviewDashboardView } from "@/components/overview/OverviewDashboardView";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getPreferences } from "@/lib/queries/account";
import { getCheckHealth } from "@/lib/queries/check-health";
import { getOverview, parseOverviewFilters } from "@/lib/queries/overview";
import { getOverviewCompetitors } from "@/lib/queries/overview-competitors";
import { Suspense } from "react";

type OverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function OverviewData({
  dateFormat,
  filters,
  isSample,
  projectRef,
}: Readonly<{
  dateFormat: Awaited<ReturnType<typeof getPreferences>>["dateFormat"];
  filters: ReturnType<typeof parseOverviewFilters>;
  isSample: boolean;
  projectRef: import("@/lib/routing/app-path").ProjectRef;
}>) {
  const now = new Date();
  const [overview, checkHealth, readable, competitors] = await Promise.all([
    getOverview(projectRef, { dateFormat, filters }),
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
  const [{ isSample, publicId }, search, preferences] = await Promise.all([
    resolveProjectAccess(project),
    searchParams,
    getPreferences(),
  ]);
  const filters = parseOverviewFilters(search);

  return (
    <PageContent>
      <Suspense fallback={<OverviewSkeleton />}>
        <OverviewData
          dateFormat={preferences.dateFormat}
          filters={filters}
          isSample={isSample}
          projectRef={publicId}
        />
      </Suspense>
    </PageContent>
  );
}
