import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";
import type { ProjectionId } from "@/lib/dashboard-layout/types";
import type { LocalReport } from "@/lib/dashboard-local/model";
import { localOverviewKeywordWhere } from "@/lib/dashboard-local/overview-scope";
import { readLocalReportInTransaction } from "@/lib/dashboard-local/read";
import type { DashboardLocalSelection } from "@/lib/dashboard-local/selection";
import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { Prisma } from "@/lib/generated/prisma/client";
import {
  resolveEffectiveSchedule,
  summarizeEffectiveSchedules,
} from "@/lib/keywords/effective-schedule";
import { isGoogleOAuthConfigured } from "@/lib/providers/analytics/google-client";
import {
  primaryProviderConnection,
  providerChainOrderBy,
} from "@/lib/rank-check/provider-chain-order";
import { asProjectRef } from "@/lib/routing/app-path";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";
import {
  buildDistribution,
  buildHighlights,
  buildKpis,
  buildOverviewMetrics,
  snapshotFor,
} from "./overview-builders";
import { overviewContributors } from "./overview-contributors";
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
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";
import { createSessionRankTrackerReportOptions } from "./rank-tracker-session-report";
import { deriveWorkspaceState } from "./workspace-state";

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
  filters?: Partial<OverviewFilters>;
  now?: Date;
  projections?: readonly ProjectionId[];
  localSelection?: DashboardLocalSelection;
};

export async function getOverview(projectId: string, options: OverviewOptions = {}) {
  const readable = await requireReadableProject(projectId);
  const selection = options.localSelection;
  if (!selection) return readOverview(readable.project, options, prisma);
  const filters = normalizeOverviewFilters(options.filters);
  const report = await createSessionRankTrackerReportOptions(
    options.now ?? new Date(),
    overviewComparisonDays(filters.range),
  );
  return prisma.$transaction(
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
}

// biome-ignore format: existing dense query assembly preserved during Local scoping.
async function readOverview(project: Awaited<ReturnType<typeof requireReadableProject>>["project"], options: OverviewOptions,
  db: Prisma.TransactionClient, localReport: LocalReport | null = null, report?: RankTrackerReportOptions) {
  const now = options.now ?? new Date();
  const needs = (projection: ProjectionId) => options.projections === undefined || options.projections.includes(projection);
  const filters = normalizeOverviewFilters(options.filters);
  const keywordIds = localReport?.rows.map((row) => row.keywordId);
  const where = localOverviewKeywordWhere(project.id, filters, keywordIds);
  const hasKeywordFilter =
    filters.device !== "all" || filters.marketIds.length > 0 || filters.tag !== null;
  // Keep independent reads parallel, but reuse the filtered count when no keyword filter is
  // active so the default dashboard never repeats the same count statement.
  const [metricData, unfilteredKeywordCount, providerConnections, monthlyCost, tags] = await Promise.all([
    loadOverviewMetricData(project.id, filters, now, { includeMarkets: true, keywordIds, ...(localReport ? { tx: db } : {}), report }),
    hasKeywordFilter && !localReport ? db.keyword.count({ where: { projectId: project.id } }) : Promise.resolve(null),
    db.providerConnection.findMany({ orderBy: providerChainOrderBy(), select: { enabled: true, kind: true, priority: true, provider: true, status: true }, where: { OR: [{ kind: "serp" }, { enabled: true, kind: "analytics", status: "connected" }], projectId: project.id } }),
    readOverviewMonthlyCost(project.id, where, now, db, Boolean(localReport)),
    db.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, where: { projectId: project.id } }),
  ]);
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
  const effectiveSchedules = keywords.length
    ? keywords.map((keyword) =>
        resolveEffectiveSchedule(keyword.schedule, projectDefaults, keyword.id, now),
      )
    : [resolveEffectiveSchedule(null, projectDefaults)];
  const scheduleSummary = summarizeEffectiveSchedules(effectiveSchedules);
  const upcoming = scheduleSummary.nextCheckAt;
  const projectReadOnly = isProjectReadOnly(project.writeMode);
  const hasEverChecked = Boolean(latestCheck);
  const lastCheckEverAt = latestCheck?.checkedAt ?? null;
  const configuredPrimary = primaryProviderConnection(serpProviders, "serp");
  const provider = configuredPrimary;
  const providerConnected = Boolean(provider);
  const serpProviderState: SerpProviderState = providerConnected ? "ready" : serpProviders.length > 0 ? "needs_attention" : "missing";
  const hasAnalyticsSource = providerConnections.some((connection) => connection.kind === "analytics");
  const state = totalKeywordCount === 0 ? "empty" : deriveWorkspaceState({ hasEverChecked, keywordCount: Math.max(1, keywords.length) });
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
    trend: needs("position_history") ? reportHistory.days.map((day) => ({
      comparisonKey: day.comparisonKey, dateKey: day.id, label: day.id, value: day.averageRankedPosition,
    })) : [],
    trendTakeaway: null as import("./overview-trend").TrendTakeaway,
    workspaceName: project.name,
  };
}
