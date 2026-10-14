import { DashboardComparisonSurface } from "@/components/dashboard-competitors/DashboardComparisonSurface";
import { DashboardScopeUnavailable } from "@/components/dashboard-layout/DashboardScopeUnavailable";
import { FeatureMessagesProvider } from "@/components/i18n/FeatureMessagesProvider";
import { OverviewDashboardView } from "@/components/overview/OverviewDashboardView";
import { OverviewPersonalDashboard } from "@/components/overview/OverviewPersonalDashboard";
import { OverviewSkeleton } from "@/components/overview/OverviewSkeleton";
import { PageContent } from "@/components/shell/PageContent";
import { loadCoreMessages } from "@/i18n/catalog-loader.server";
import { resolveRegionalDocumentLocale } from "@/i18n/document-locale.server";
import { getProjectRole } from "@/lib/auth/authorize";
import { canProjectAction } from "@/lib/auth/capabilities";
import {
  BusinessLocationConflictError,
  BusinessLocationUnavailableError,
} from "@/lib/business-location-store/errors";
import type { ProjectionId } from "@/lib/dashboard-layout/types";
import { requireReadableProject, resolveProjectAccess } from "@/lib/queries/_auth";
import { getCheckHealth } from "@/lib/queries/check-health";
import { optionalDashboardRead } from "@/lib/queries/dashboard-optional-read";
import { loadDashboardPersonalContext } from "@/lib/queries/dashboard-personal-context";
import { getOverview, parseOverviewFilters } from "@/lib/queries/overview";
import { getOverviewCompetitors } from "@/lib/queries/overview-competitors";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { Suspense } from "react";

type OverviewPageProps = {
  params: Promise<{ project: string }>;
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
};

async function OverviewData({
  filters,
  isSample,
  projectRef,
  explicitPreset,
  explicitLocalSubject,
  explicitComparison,
  scopeParams,
}: Readonly<{
  filters: ReturnType<typeof parseOverviewFilters>;
  isSample: boolean;
  projectRef: import("@/lib/routing/app-path").ProjectRef;
  explicitPreset: string | string[] | undefined;
  explicitLocalSubject: string | string[] | undefined;
  explicitComparison: string | string[] | undefined;
  scopeParams: import("@/lib/dashboard-competitors/scope").ExplicitDashboardScope;
}>) {
  const readable = await requireReadableProject(projectRef);
  const reauthorize = () => requireReadableProject(projectRef);
  const now = new Date();
  const personal = isSample
    ? null
    : await loadDashboardPersonalContext(projectRef, explicitPreset, {
        localSubject: explicitLocalSubject,
        asOf: now,
        comparison: explicitComparison,
        filters,
        scopeParams,
      });
  // An explicit unresolved Local/Competitors preset never falls back to a broad General aggregation.
  if (
    personal &&
    (personal.invalidPreset || !personal.composition.projections.all.includes("coverage_summary"))
  )
    return <DashboardScopeUnavailable personal={personal} />;
  if (personal?.composition.layout.preset === "competitors") {
    const health = await optionalDashboardRead(
      () => getCheckHealth(projectRef, { now }),
      reauthorize,
    );
    return <DashboardComparisonSurface personal={personal} checkHealth={health.value} />;
  }
  const result = await Promise.all([
    getOverview(projectRef, {
      filters,
      now,
      projections: personal?.composition.projections.all,
      localSelection: personal?.local?.selection ?? undefined,
    }),
    optionalDashboardRead(() => getCheckHealth(projectRef, { now }), reauthorize),
    isSample || !personal?.composition.projections.all.includes("competitor_comparison")
      ? Promise.resolve({ state: "ready" as const, value: null })
      : optionalDashboardRead(() => getOverviewCompetitors(projectRef, filters, now), reauthorize),
  ]).catch((error: unknown) => {
    if (
      personal?.local &&
      (error instanceof RankReportCapacityError ||
        error instanceof RankReportSnapshotConflictError ||
        error instanceof BusinessLocationConflictError ||
        error instanceof BusinessLocationUnavailableError)
    )
      return {
        failure:
          error instanceof RankReportCapacityError
            ? ("capacity" as const)
            : ("unavailable" as const),
      };
    throw error;
  });
  if (!Array.isArray(result)) {
    if (!personal) throw new Error("Dashboard scope is unavailable.");
    return (
      <DashboardScopeUnavailable
        personal={{
          ...personal,
          local: personal.local
            ? {
                ...personal.local,
                state: result.failure,
                selection: null,
              }
            : null,
        }}
      />
    );
  }
  const [overview, healthRead, competitorRead] = result;
  const checkHealth = healthRead.value;
  const competitors = competitorRead.value;
  const failedProjections: ProjectionId[] = [
    ...(healthRead.state === "error" ? ["connection_details" as const] : []),
    ...(competitorRead.state === "error" ? ["competitor_comparison" as const] : []),
  ];
  const state = overview.state ?? (overview.isEmpty ? "empty" : "populated");
  const role = getProjectRole(readable.actor, readable.project.id);

  if (
    personal &&
    (state === "populated" || personal.local?.state === "ready" || failedProjections.length > 0)
  )
    return (
      <OverviewPersonalDashboard
        overview={{ ...overview, state }}
        checkHealth={checkHealth}
        failedProjections={failedProjections}
        competitors={competitors}
        canCreateKeyword={canProjectAction(role, "create", "keyword")}
        loadedProjections={personal.composition.projections.all}
        localReport={overview.localReport}
        personal={{
          access: personal.access,
          layout: personal.composition.layout,
          preference: personal.preference,
          scopeKey: personal.scopeKey,
          local: personal.local,
        }}
      />
    );

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
          <OverviewData
            filters={filters}
            isSample={isSample}
            projectRef={publicId}
            explicitPreset={search?.dashboardView}
            explicitLocalSubject={search?.dashboardLocalSubject}
            explicitComparison={search?.dashboardCompetitorView}
            scopeParams={{ device: search?.device, market: search?.market, tag: search?.tag }}
          />
        </Suspense>
      </FeatureMessagesProvider>
    </PageContent>
  );
}
