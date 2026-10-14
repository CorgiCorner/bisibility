import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
  filterCompetitorObservations,
} from "@/lib/competitors/competitor-market-model";
import type { CompetitorViewConfig } from "@/lib/competitors/saved-view-v2-model";
import { competitorMarketKey } from "@/lib/competitors/scope-model";
import { competitorAppliesToMarket } from "@/lib/competitors/serp-comparison";
import { normalizeCompetitorDomain } from "@/lib/competitors/types";
import type { Prisma } from "@/lib/generated/prisma/client";
import { loadCompetitorCurrentData } from "@/lib/queries/competitor-current-data";
import { loadCompetitorPolicies } from "@/lib/queries/competitor-policies";
import { managedCompetitor } from "@/lib/queries/competitor-query-model";
import { type OverviewFilters, overviewRangeStart } from "@/lib/queries/overview-filters";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { RankReportSnapshotConflictError } from "@/lib/rank-reports/errors";
import { trackedProjectDomain } from "@/lib/schemas/project";
import type { DashboardComparisonReport } from "./model";
import type { DashboardComparisonSelection } from "./selection";

export async function readDashboardComparison(
  tx: Prisma.TransactionClient,
  actor: Actor,
  project: { id: string; publicId: string; domain: string | null },
  selection: DashboardComparisonSelection,
  config: CompetitorViewConfig,
  filters: OverviewFilters,
  options: RankTrackerReportOptions,
) {
  const scope = config.scope;
  const market = await tx.projectMarket.findFirst({
    where: { projectId: project.id, locationId: scope.locationId, status: "active" },
    select: {
      location: { select: { id: true, displayName: true, languageLabel: true, kind: true } },
    },
  });
  const ownDomain = normalizeCompetitorDomain(trackedProjectDomain(project.domain) ?? "");
  if (!market || !ownDomain) return null;
  const policies = await loadCompetitorPolicies(project.id, tx);
  const members = policies
    .filter((row) => competitorAppliesToMarket(row, scope.locationId))
    .map(managedCompetitor);
  if (members.length === 0) return null;
  const columns = [
    { domain: ownDomain, label: ownDomain, kind: "You" as const },
    ...members.map((row) => ({ ...row, kind: "Managed" as const })),
  ];
  if (new Set(columns.map((row) => row.domain)).size !== columns.length) return null;
  const current = await loadCompetitorCurrentData(tx, actor, project, options, {
    currentNotBefore: overviewRangeStart(options.asOf, filters.range),
    where: {
      locationId: scope.locationId,
      device: scope.device,
      publicId: { notIn: config.filters.excludedKeywordIds },
      ...(filters.tag ? { tags: { some: { tag: { name: filters.tag } } } } : {}),
    },
  });
  const observations = current.observationsFor(columns, scope.locationId, scope.device);
  const data = {
    allColumns: columns,
    competitorCount: members.length,
    device: scope.device,
    engine: scope.engine,
    key: competitorMarketKey(scope),
    locationId: scope.locationId,
    location: market.location.displayName,
    languageLabel: market.location.languageLabel,
    locationKind: market.location.kind,
    observations,
    tags: [...new Set(observations.flatMap((row) => row.tags))].sort(),
    trackedKeywordCount: observations.length,
  };
  const chosen = filterCompetitorObservations(data, { ...config.filters, tag: filters.tag });
  const ids = new Set(chosen.map((row) => row.id));
  const now = buildCompetitorMarket(
    { ...data, observations: chosen, trackedKeywordCount: chosen.length },
    emptyCompetitorFilter,
  );
  const previous = current.baselineFor(columns, scope.locationId, scope.device);
  const oldRows = previous.rows.filter((row) => ids.has(row.id));
  if (
    oldRows.length !== chosen.length ||
    oldRows.some((row) => row.volume !== chosen.find((now) => now.id === row.id)?.volume)
  )
    throw new RankReportSnapshotConflictError();
  const comparableCount = previous.comparableIds.filter((id) => ids.has(id)).length;
  const baseline = current.baselineAsOf
    ? buildCompetitorMarket(
        { ...data, observations: oldRows, trackedKeywordCount: chosen.length },
        emptyCompetitorFilter,
      )
    : null;
  const completeComparison =
    baseline !== null &&
    comparableCount === chosen.length &&
    now.quality.measured === chosen.length &&
    baseline.quality.measured === chosen.length;
  const report: DashboardComparisonReport = {
    asOf: options.asOf.toISOString(),
    baselineAsOf: current.baselineAsOf?.toISOString() ?? null,
    selection,
    selectionRevisionId: `${selection.viewId}:${selection.revision}`,
    filters,
    expectedIds: [...ids],
    population: "frozen_current_filtered_cohort",
    current: now,
    baseline,
    comparableCount,
    deltas: now.shares.map((row) => {
      const before =
        baseline?.shares.find((old) => old.domain === row.domain)?.shareOfVoice ?? null;
      return {
        domain: row.domain,
        percentagePoints:
          completeComparison && row.shareOfVoice !== null && before !== null
            ? row.shareOfVoice - before
            : null,
      };
    }),
  };
  return report;
}
