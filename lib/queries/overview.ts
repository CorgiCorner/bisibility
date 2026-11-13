import { recordResultReceipt } from "@/lib/activity/result-receipt-extension";
import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";
import { shiftAnnotationDayKey } from "@/lib/annotations/chart-markers";
import type { ChartMarker } from "@/lib/annotations/marker-style";
import { annotationDayKey } from "@/lib/annotations/ruler";
import type { ProjectionId } from "@/lib/dashboard-layout/types";
import type { LocalReport } from "@/lib/dashboard-local/model";
import { localOverviewKeywordWhere } from "@/lib/dashboard-local/overview-scope";
import { readLocalReportInTransaction } from "@/lib/dashboard-local/read";
import type { DashboardLocalSelection } from "@/lib/dashboard-local/selection";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createKeywordMembershipProjector } from "@/lib/keywords/schedule-membership";
import { isGoogleOAuthConfigured } from "@/lib/providers/analytics/google-client";
import { readFirstCheckSourceReady } from "@/lib/providers/first-check-readiness";
import {
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { asProjectRef } from "@/lib/routing/app-path";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";
import { readChartAnnotations } from "./chart-annotations";
import {
  buildDistribution,
  buildHighlights,
  buildKpis,
  buildOverviewMetrics,
  snapshotFor,
} from "./overview-builders";
import { overviewContributors } from "./overview-contributors";
import { loadDashboardConversions } from "./overview-conversions";
import { loadOverviewMetricData } from "./overview-data";
import {
  normalizeOverviewFilters,
  type OverviewFilters,
  overviewComparisonDays,
} from "./overview-filters";
import { buildOverviewMarkets } from "./overview-markets";
import { overviewRankedPositions } from "./overview-metrics";
import { readOverviewMonthlyCost } from "./overview-monthly-cost";
import { buildOverviewReportHistory } from "./overview-report-history";
import { loadDashboardSeoCost } from "./overview-seo-cost";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { createSessionRankTrackerReportOptions } from "./rank-tracker-session-report";
import { getRequestProjectDefaults } from "./workspace-request-data";
import { deriveWorkspaceState } from "./workspace-state";

async function overviewChartMarkers(projectId: string, now: Date, range: OverviewFilters["range"]) {
  const defaults = await getRequestProjectDefaults(projectId);
  const timeZone = defaults?.timezone;
  if (!timeZone) return [];
  const toKey = annotationDayKey(now, timeZone);
  const fromKey = shiftAnnotationDayKey(toKey, 1 - overviewComparisonDays(range));
  return readChartAnnotations(projectId, { fromKey, toKey });
}

export type { OverviewFilters } from "./overview-filters";
export { parseOverviewFilters } from "./overview-filters";
export type SerpProviderState = "missing" | "needs_attention" | "ready";
export type DataSourceStatus =
  | "failed"
  | "healthy"
  | "migrationHold"
  | "needsAttention"
  | "notConnected";

type OverviewOptions = {
  conversionSource?: string | null;
  filters?: Partial<OverviewFilters>;
  now?: Date;
  projections?: readonly ProjectionId[];
  localSelection?: DashboardLocalSelection;
};

export async function getOverview(projectId: string, options: OverviewOptions = {}) {
  const readable = await requireReadableProject(projectId);
  const selection = options.localSelection;
  if (!selection) {
    const result = await readOverview(readable.project, options, prisma);
    recordResultReceipt({
      userId: readable.actor.id,
      surface: "app",
      nonEmpty: result.visibilityCoverage.measured > 0,
    });
    return result;
  }
  const filters = normalizeOverviewFilters(options.filters);
  const report = await createSessionRankTrackerReportOptions(
    options.now ?? new Date(),
    overviewComparisonDays(filters.range),
  );
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SET TRANSACTION READ ONLY`;
      const localReport = await readLocalReportInTransaction(
        tx,
        readable.project.publicId,
        { actor: readable.actor },
        selection,
        filters,
        report,
      );
      return readOverview(
        readable.project,
        { ...options, now: report.asOf },
        tx,
        localReport,
        report,
      );
    },
    { ...REPORT_READ_TRANSACTION },
  );
  recordResultReceipt({
    userId: readable.actor.id,
    surface: "app",
    nonEmpty: result.visibilityCoverage.measured > 0,
  });
  return result;
}

// biome-ignore format: existing dense query assembly preserved during Local scoping.
async function readOverview(project: Awaited<ReturnType<typeof requireReadableProject>>["project"], options: OverviewOptions,
  db: Prisma.TransactionClient, localReport: LocalReport | null = null, report?: RankTrackerReportOptions) {
  const now = options.now ?? new Date();
  const needs = (projection: ProjectionId) => options.projections === undefined || options.projections.includes(projection);
  const wants = (projection: ProjectionId) => options.projections?.includes(projection) === true;
  const filters = normalizeOverviewFilters(options.filters);
  const keywordIds = localReport?.rows.map((row) => row.keywordId);
  const where = localOverviewKeywordWhere(project.id, filters, keywordIds);
  const hasKeywordFilter =
    filters.device !== "all" || filters.marketIds.length > 0 || filters.tag !== null;
  // Pool reads may run in parallel; a Local report shares one transaction connection.
  const metricRead = () => loadOverviewMetricData(project.id, filters, now, { includeMarkets: true, keywordIds, ...(localReport ? { tx: db } : {}), report });
  const countRead = () => hasKeywordFilter && !localReport ? db.keyword.count({ where: { projectId: project.id } }) : Promise.resolve(null);
  const providerRead = () => db.providerConnection.findMany({ orderBy: providerChainOrderBy(), select: { credentialSource: true, credentialsEncrypted: true, enabled: true, kind: true, priority: true, provider: true, status: true }, where: { OR: [{ kind: "serp" }, { enabled: true, kind: "analytics", status: "connected" }], projectId: project.id } });
  const costRead = () => readOverviewMonthlyCost(project.id, where, now, db, Boolean(localReport));
  const tagRead = () => db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, where: { projectId: project.id } });
  const markerRead = () =>
    needs("position_history") || wants("organic_conversions")
      ? overviewChartMarkers(project.id, now, filters.range)
      : Promise.resolve([] as ChartMarker[]);
  const chartMarkersPromise = markerRead();
  const [metricData, unfilteredKeywordCount, providerConnections, monthlyCost, tags] = localReport
    ? [await metricRead(), await countRead(), await providerRead(), await costRead(), await tagRead()] as const
    : await Promise.all([metricRead(), countRead(), providerRead(), costRead(), tagRead()]);
  const chartMarkers = await chartMarkersPromise;
  const {
    addedThisMonth,
    filteredKeywordCount,
    keywordVolumes,
    keywords,
    latestCheck,
    marketKeywords,
    projectMarkets,
    projectDefaults,
  } = metricData;
  const totalKeywordCount = unfilteredKeywordCount ?? filteredKeywordCount;
  const serpProviders = providerConnections.filter((connection) => connection.kind === "serp");
  const snapshots = keywords.map((keyword) => snapshotFor(keyword, keywordVolumes.get(keyword.id) ?? null, now));
  const overviewMetrics = buildOverviewMetrics(snapshots, { asOf: now, eligibleTotal: metricData.eligibleTargetCount });
  const reportHistory = buildOverviewReportHistory(
    needs("visibility_history") || needs("quality_history") || needs("position_history") ? keywords : [],
    keywordVolumes, { asOf: now, range: filters.range, timeZone: projectDefaults?.timezone ?? null },
  );
  const positions = overviewRankedPositions(snapshots);
  const membership = createKeywordMembershipProjector(now);
  const upcoming = keywords.flatMap((keyword) => {
    const next = membership(keyword.checkSchedule, keyword.id, projectDefaults?.timezone ?? "UTC").nextCheckAt;
    return next ? [next] : [];
  }).sort((a, b) => a.getTime() - b.getTime())[0] ?? null;
  const projectReadOnly = isProjectReadOnly(project.writeMode);
  const hasEverChecked = Boolean(latestCheck);
  const lastCheckEverAt = latestCheck?.checkedAt ?? null;
  const configuredPrimary = primaryProviderConnection(serpProviders, "serp");
  const provider = configuredPrimary;
  const providerConnected = Boolean(provider);
  const serpProviderState: SerpProviderState = providerConnected ? "ready" : serpProviders.length > 0 ? "needs_attention" : "missing";
  const firstCheckSourceReady = !projectReadOnly && !hasEverChecked && totalKeywordCount > 0
    ? await readFirstCheckSourceReady(project.id, serpProviders, now)
    : false;
  const hasAnalyticsSource = providerConnections.some((connection) => connection.kind === "analytics");
  const state = totalKeywordCount === 0 ? "empty" : deriveWorkspaceState({ hasEverChecked, keywordCount: Math.max(1, keywords.length) });
  const [organicConversions, seoCost] = await Promise.all([
    wants("organic_conversions")
      ? loadDashboardConversions(
          project.publicId,
          filters.range,
          now,
          options.conversionSource,
          projectDefaults?.timezone ?? "UTC",
        )
      : Promise.resolve(null),
    wants("seo_cost") ? loadDashboardSeoCost(project.publicId) : Promise.resolve(null),
  ]);
  const { checksThisMonth, providerCostCents } = monthlyCost;
  const providerStatus: DataSourceStatus = projectReadOnly
    ? "migrationHold"
    : providerConnected
      ? "healthy"
      : serpProviders.length > 0
        ? "needsAttention"
        : "notConnected";
  const dataSource = {
    checksThisMonth,
    lastCheckAt: lastCheckEverAt?.toISOString() ?? null,
    lastCheckProvider: latestCheck?.provider ?? null,
    nextCheckAt: projectReadOnly ? null : upcoming?.toISOString() ?? null,
    now: now.toISOString(),
    primaryProvider: configuredPrimary?.provider ?? null,
    providerCostCents: providerCostCents,
    status: providerStatus,
  };
  return {
    addedThisMonth,
    ...(localReport ? { localReport } : {}),
    byMarket: needs("market_rollup") ? buildOverviewMarkets(
      marketKeywords,
      projectMarkets.filter(
        (market) => filters.marketIds.length === 0 || filters.marketIds.includes(market.locationId),
      ),
      {
      defaultFrequency: projectDefaults?.frequency,
      now,
      range: filters.range,
      },
    ) : [],
    checksThisMonth,
    dataSource,
    distribution: buildDistribution(positions),
    domain: trackedProjectDomain(project.domain) ?? "",
    estimatedProviderCostCents: providerCostCents,
    firstCheckSourceReady,
    firstPendingKeywordId: state === "no-data" ? (keywords[0]?.publicId ?? null) : null,
    gettingStarted: { gscOAuthConfigured: isGoogleOAuthConfigured(), hasAnalyticsSource, hasCheck: hasEverChecked, hasKeywords: totalKeywordCount > 0, projectId: project.publicId, projectRef: asProjectRef(project.publicId), providerConnected } as { gscOAuthConfigured: boolean; hasAnalyticsSource: boolean; hasCheck: boolean; hasKeywords: boolean; projectId: string; projectRef?: import("@/lib/routing/app-path").ProjectRef; providerConnected: boolean },
    hasEverChecked,
    highlights: needs("keyword_highlights") ? buildHighlights(snapshots, now) : [],
    isEmpty: totalKeywordCount === 0,
    kpis: buildKpis(snapshots, filteredKeywordCount, addedThisMonth, overviewMetrics),
    lastCheckAt: lastCheckEverAt,
    lastCheckEverAt,
    nextCheckAt: upcoming,
    providerConnected,
    projectReadOnly,
    publicId: asProjectRef(project.publicId),
    serpProviderState,
    state,
    toolbar: {
      availableTags: tags.map((tag) => tag.name),
      deviceValue: filters.device,
      marketOptions: projectMarkets.map((market) => ({
        label: market.location.displayName,
        secondary: market.location.languageLabel,
        value: market.locationId,
      })),
      marketValues: filters.marketIds,
      rangeValue: filters.range,
      tagValue: filters.tag,
    },
    trackedKeywordCount: filteredKeywordCount,
    visibilityCoverage: {
      limited: filteredKeywordCount > keywords.length,
      measured: overviewMetrics.visibilityMeasuredKeywordCount,
      total: metricData.eligibleTargetCount,
    },
    qualityReport: overviewMetrics.qualityReport,
    reportHistory,
    contributors: needs("contributions") ? overviewContributors(keywords, overviewMetrics.qualityReport) : [],
    chartMarkers,
    organicConversions,
    seoCost,
    trend: needs("position_history") ? reportHistory.days.map((day) => ({
      comparisonKey: day.comparisonKey,
      dateKey: day.id,
      label: day.id,
      rankedKeywordCount: day.rankedKeywordCount,
      rankedKeywords: day.rankedKeywords,
      value: day.averageRankedPosition,
    })) : [],
    trendTakeaway: null as import("./overview-trend").TrendTakeaway,
    workspaceName: project.name,
  };
}
