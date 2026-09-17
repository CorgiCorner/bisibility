import "server-only";

import { prisma } from "@/lib/db/prisma";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import {
  resolveEffectiveSchedule,
  summarizeEffectiveSchedules,
} from "@/lib/keywords/effective-schedule";
import { isGoogleOAuthConfigured } from "@/lib/providers/analytics/google-client";
import { monthStartUtc } from "@/lib/rank-check/budget";
import { aggregateObservedUsage } from "@/lib/rank-check/observed-usage";
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
  buildTrend,
  buildTrendTakeaway,
  snapshotFor,
} from "./overview-builders";
import { loadOverviewMetricData } from "./overview-data";
import {
  normalizeOverviewFilters,
  type OverviewFilters,
  overviewKeywordWhere,
  overviewRangeStart,
} from "./overview-filters";
import { buildOverviewMarkets } from "./overview-markets";
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

function nextMonthStartUtc(now: Date) {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
}

// biome-ignore format: dense query assembly keeps this file under the project line cap.
export async function getOverview(projectId: string, options: { filters?: Partial<OverviewFilters>; now?: Date } = {}) {
  const now = options.now ?? new Date();
  const filters = normalizeOverviewFilters(options.filters);
  const trendStart = overviewRangeStart(now, filters.range);
  const { project } = await requireReadableProject(projectId);
  const where = overviewKeywordWhere(project.id, filters);
  const hasKeywordFilter =
    filters.device !== "all" || filters.marketIds.length > 0 || filters.tag !== null;
  // Keep independent reads parallel, but reuse the filtered count when no keyword filter is
  // active so the default dashboard never repeats the same count statement.
  const [metricData, unfilteredKeywordCount, providerConnections, monthChecks, tags] = await Promise.all([
    loadOverviewMetricData(project.id, filters, now, { includeMarkets: true }),
    hasKeywordFilter ? prisma.keyword.count({ where: { projectId: project.id } }) : Promise.resolve(null),
    prisma.providerConnection.findMany({ orderBy: providerChainOrderBy(), select: { enabled: true, kind: true, priority: true, provider: true, status: true }, where: { OR: [{ kind: "serp" }, { enabled: true, kind: "analytics", status: "connected" }], projectId: project.id } }),
    prisma.rankCheck.findMany({ select: { costCents: true }, where: { checkedAt: { gte: monthStartUtc(now), lt: nextMonthStartUtc(now) }, keyword: where, status: "completed" } }),
    prisma.tag.findMany({ orderBy: { name: "asc" }, select: { name: true }, where: { projectId: project.id } }),
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
  const snapshots = keywords.map((keyword) => snapshotFor(keyword, keywordVolumes.get(keyword.id) ?? null));
  const overviewMetrics = buildOverviewMetrics(snapshots);
  const positions = snapshots.flatMap((item) => (item.position ? [item.position] : []));
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
  const observedUsage = aggregateObservedUsage(monthChecks);
  const checksThisMonth = observedUsage.checkCount;
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
    providerCostCents: observedUsage.totalCostCents,
    status: providerStatus,
  };
  return {
    addedThisMonth,
    byMarket: buildOverviewMarkets(
      marketKeywords,
      projectMarkets.filter(
        (market) => filters.marketIds.length === 0 || filters.marketIds.includes(market.locationId),
      ),
      {
      defaultFrequency: projectDefaults?.frequency,
      now,
      range: filters.range,
      },
    ),
    checksThisMonth,
    dataSource,
    distribution: buildDistribution(positions),
    domain: trackedProjectDomain(project.domain) ?? "",
    estimatedProviderCostCents: observedUsage.totalCostCents,
    firstPendingKeywordId: state === "no-data" ? (keywords[0]?.publicId ?? null) : null,
    gettingStarted: { gscOAuthConfigured: isGoogleOAuthConfigured(), hasAnalyticsSource, hasCheck: hasEverChecked, hasKeywords: totalKeywordCount > 0, projectId: project.publicId, projectRef: asProjectRef(project.publicId), providerConnected } as { gscOAuthConfigured: boolean; hasAnalyticsSource: boolean; hasCheck: boolean; hasKeywords: boolean; projectId: string; projectRef?: import("@/lib/routing/app-path").ProjectRef; providerConnected: boolean },
    hasEverChecked,
    highlights: buildHighlights(snapshots, now),
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
      total: keywords.length,
    },
    trend: buildTrend(keywords, trendStart),
    trendTakeaway: buildTrendTakeaway(keywords, now, keywordVolumes),
    workspaceName: project.name,
  };
}
