import "server-only";
import type { Actor } from "@/lib/auth/authorize";
import {
  buildCompetitorMarket,
  emptyCompetitorFilter,
} from "@/lib/competitors/competitor-market-model";
import type { CompetitorScope } from "@/lib/competitors/scope-model";
import { resolveCompetitorMarket } from "@/lib/competitors/scope-model";
import { competitorAppliesToMarket } from "@/lib/competitors/serp-comparison";
import { normalizeCompetitorDomain } from "@/lib/competitors/types";
import { prisma } from "@/lib/db/prisma";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject, requireReadableProjectFor } from "./_auth";
import { loadCompetitorCurrentData } from "./competitor-current-data";
import { loadCompetitorPolicies } from "./competitor-policies";
import {
  competitorSuggestions,
  managedCompetitor,
  summarizeCompetitorMarkets,
} from "./competitor-query-model";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

async function queryCompetitors(
  scope: Awaited<ReturnType<typeof requireReadableProject>>,
  requested: CompetitorScope | null | undefined,
  includeAllMarkets: boolean,
  options?: RankTrackerReportOptions,
) {
  return prisma.$transaction(
    async (tx) => {
      const { actor } = scope;
      const project = await tx.project.findUniqueOrThrow({
        where: { id: scope.project.id },
        select: { id: true, publicId: true, domain: true },
      });
      const ownDomain = normalizeCompetitorDomain(trackedProjectDomain(project.domain) ?? "") ?? "";
      const [competitorRows, current] = await Promise.all([
        loadCompetitorPolicies(project.id, tx),
        loadCompetitorCurrentData(tx, actor, project, options),
      ]);
      const managed = competitorRows.map(managedCompetitor);
      const suggestions = competitorSuggestions([], current.suggestionRows, ownDomain, managed);
      const summaries = summarizeCompetitorMarkets(
        current.candidates.map((row) => ({
          ...row,
          locationId: row.locationRef.id,
          locationRef: row.locationRef,
          rankChecks: [],
        })),
      );
      const markets = summaries.map((option) => {
        const members = competitorRows
          .filter((row) => competitorAppliesToMarket(row, option.locationId))
          .map(managedCompetitor);
        const allColumns = [
          { domain: ownDomain, kind: "You" as const, label: ownDomain },
          ...members.map((member) => ({ ...member, kind: "Managed" as const })),
        ];
        const observations = current.observationsFor(allColumns, option.locationId, option.device);
        return buildCompetitorMarket(
          {
            ...option,
            allColumns,
            competitorCount: members.length,
            observations,
            tags: [...new Set(observations.flatMap((row) => row.tags))].sort(),
            trackedKeywordCount: observations.length,
          },
          emptyCompetitorFilter,
        );
      });
      const optionsWithCounts = summaries
        .map((option) => ({
          ...option,
          checkedKeywordCount:
            markets.find((market) => market.key === option.key)?.checkedKeywordCount ?? 0,
        }))
        .sort(
          (a, b) =>
            b.checkedKeywordCount - a.checkedKeywordCount ||
            b.keywordCount - a.keywordCount ||
            a.location.localeCompare(b.location) ||
            a.device.localeCompare(b.device),
        );
      const selected = resolveCompetitorMarket(optionsWithCounts, requested);
      const market = markets.find((value) => value.key === selected?.key) ?? null;
      return {
        allMarkets: includeAllMarkets ? markets : null,
        managedCompetitors: managed,
        market,
        marketOptions: optionsWithCounts.map(
          ({ observations: _observations, ...option }) => option,
        ),
        projectId: project.publicId,
        scope:
          requested ??
          (selected
            ? { device: selected.device, engine: selected.engine, locationId: selected.locationId }
            : null),
        suggestions,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function getCompetitorsView(projectId: string, requested?: CompetitorScope | null) {
  const result = await queryCompetitors(await requireReadableProject(projectId), requested, false);
  return {
    managedCompetitors: result.managedCompetitors,
    market: result.market,
    markets: result.marketOptions,
    projectId: result.projectId,
    scope: result.scope,
    suggestions: result.suggestions,
  };
}
export async function getCompetitorsApiView(projectId: string) {
  return readCompetitorsApiView(await requireReadableProject(projectId));
}
export async function getCompetitorsApiViewFor(
  actor: Actor,
  projectId: string,
  options?: RankTrackerReportOptions,
) {
  return readCompetitorsApiView(await requireReadableProjectFor(actor, projectId), options);
}
async function readCompetitorsApiView(
  scope: Awaited<ReturnType<typeof requireReadableProject>>,
  options?: RankTrackerReportOptions,
) {
  const result = await queryCompetitors(scope, null, true, options);
  return {
    managedCompetitors: result.managedCompetitors,
    markets: result.allMarkets ?? [],
    projectId: result.projectId,
    suggestions: result.suggestions,
  };
}
