import { domainMatches } from "@/lib/domains/normalize";
import { positivePosition, qualifyMeasurement } from "@/lib/rank-measurements/qualify";
import { recordedMeasurement } from "@/lib/rank-measurements/recorded-check";
import type {
  RankReportPolicy,
  RankReportTarget,
  RetainedReportCheck,
} from "@/lib/rank-reports/model";
import { targetReportFreshForMs } from "@/lib/rank-reports/policy";
import type { CompetitorObservation } from "./types";

/** Every domain is qualified against the same original check and current definition proof. */
export function competitorObservation(
  target: RankReportTarget,
  check: RetainedReportCheck | null,
  policy: RankReportPolicy,
  projectId: string,
  domains: readonly string[],
  ownDomain: string,
  label: { keyword: string; tags: string[] },
): CompetitorObservation {
  const ranks: Record<string, number | null> = {};
  const quality: NonNullable<CompetitorObservation["quality"]> = Object.fromEntries(
    domains.map((domain) => {
      const positions = (check?.observationRun?.items ?? [])
        .filter(
          (item) =>
            item.resultKind === "organic_result" &&
            item.domain &&
            domainMatches(item.domain, domain),
        )
        .flatMap((item) => {
          const position = positivePosition(item.rankGroup);
          return position === null ? [] : [position];
        });
      const position =
        domain === ownDomain
          ? positivePosition(check?.position)
          : positions.length
            ? Math.min(...positions)
            : null;

      if (!check) {
        ranks[domain] = null;
        return [
          domain,
          {
            evidence: "not_observed" as const,
            freshness: "unknown" as const,
            reason: "not_observed",
          },
        ];
      }
      const original = recordedMeasurement(check, target.id, projectId);
      const result = qualifyMeasurement(
        { ...original, position },
        {
          asOf: policy.asOf,
          horizon: 10,
          minimumRequestedDepth: 10,
          expectedScope: target.expectedScope,
          requireCurrentScope: true,
          freshForMs: targetReportFreshForMs(target, policy),
          requestedGeo: target.requestedGeo,
        },
      );
      ranks[domain] =
        result.evidence === "positive" && result.freshness !== "stale" ? position : null;
      return [
        domain,
        {
          evidence: result.evidence,
          freshness: result.freshness,
          reason: result.reason ?? result.freshnessReason,
        },
      ];
    }),
  );
  return {
    ...label,
    id: target.id,
    completed: check?.status === "completed",
    checkedAt: check?.checkedAt.toISOString() ?? null,
    ranked: Object.values(ranks).some((rank) => rank !== null),
    ranks,
    quality,
    volume: target.volume,
  };
}
