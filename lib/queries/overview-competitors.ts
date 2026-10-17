import { REPORT_READ_TRANSACTION } from "@/lib/rank-reports/read-transaction";
import "server-only";
import { competitorObservation } from "@/lib/competitors/observation-quality";
import {
  type OverviewCompetitorComparison,
  sortOverviewCompetitorRows,
  summarizeOverviewCompetitors,
} from "@/lib/competitors/overview-comparison";
import { prisma } from "@/lib/db/prisma";
import { RANK_REPORT_HOST_LIMITS } from "@/lib/rank-reports/host-policy";
import { trackedProjectDomain } from "@/lib/schemas/project";
import { requireReadableProject } from "./_auth";
import { loadCompetitorPolicies } from "./competitor-policies";
import { readLegacyOverviewQuality } from "./legacy-overview-quality";
import { type OverviewFilters, overviewKeywordWhere, overviewRangeStart } from "./overview-filters";
import type { RankTrackerReportOptions } from "./rank-tracker-report-model";

/** Legacy equal-target domain comparison, with one qualified original SERP per target. */
export async function getOverviewCompetitors(
  projectRef: string,
  filters: OverviewFilters,
  now = new Date(),
  report?: RankTrackerReportOptions,
): Promise<OverviewCompetitorComparison | null> {
  const scope = await requireReadableProject(projectRef);
  return prisma.$transaction(
    async (tx) => {
      const competitors = await loadCompetitorPolicies(scope.project.id, tx);
      if (!competitors.length) return null;
      const keywords = await tx.keyword.findMany({
        where: { ...overviewKeywordWhere(scope.project.id, filters), createdAt: { lte: now } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: RANK_REPORT_HOST_LIMITS.maxTargets + 1,
        select: { id: true, publicId: true, createdAt: true, locationId: true, text: true },
      });
      const quality = await readLegacyOverviewQuality(tx, scope, keywords, {
        now,
        horizon: 10,
        currentNotBefore: overviewRangeStart(now, filters.range),
        includeItems: true,
        report,
      });
      const resolved = new Map(quality.resolutions.map((target) => [target.id, target]));
      const targetById = new Map(quality.targets.map((target) => [target.id, target]));
      const ownDomain = trackedProjectDomain(scope.project.domain) ?? "";
      const rows = competitors.flatMap((competitor) =>
        summarizeOverviewCompetitors(
          [competitor],
          keywords.map((keyword) => {
            const target = targetById.get(keyword.publicId);
            const resolution = resolved.get(keyword.publicId);
            if (!target || !resolution)
              throw new Error("Overview competitor target is unavailable.");
            const check =
              target.checks.find(
                (row) => row.id === resolution.resolution.current?.measurement.id,
              ) ?? null;
            const observation = competitorObservation(
              target,
              check,
              quality.policy,
              scope.project.id,
              [ownDomain, competitor.domain],
              ownDomain,
              { keyword: keyword.text, tags: [] },
            );
            const proof = observation.quality?.[competitor.domain];
            const rank = observation.ranks[competitor.domain];
            const determinate =
              proof?.evidence === "positive" || proof?.evidence === "known_absent";
            return {
              locationId: keyword.locationId,
              ownPosition:
                observation.quality?.[ownDomain]?.freshness === "fresh"
                  ? observation.ranks[ownDomain]
                  : null,
              ranks:
                determinate && proof?.freshness === "fresh"
                  ? rank === null
                    ? []
                    : [{ domain: competitor.domain, position: rank }]
                  : null,
            };
          }),
        ),
      );
      return rows.length ? { rows: sortOverviewCompetitorRows(rows), limited: false } : null;
    },
    { ...REPORT_READ_TRANSACTION },
  );
}
