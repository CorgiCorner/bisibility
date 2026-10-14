import { positivePosition } from "./qualify";
import type { EvidenceState, FreshnessState } from "./types";
import { frozenWeights } from "./weights";

/** Top10 linear scoring with shared quality and weight policy, distinct from legacy totals. */
export const COMPETITOR_SOV_DEFINITION = "bisibility-sov-top10-v2";
export type CompetitorDomainQuality = {
  evidence: EvidenceState;
  freshness: FreshnessState;
  reason: string | null;
};
export type CompetitorScoreRow = {
  id: string;
  volume: number | null;
  ranks: Readonly<Record<string, number | null>>;
  quality?: Readonly<Record<string, CompetitorDomainQuality>>;
};
const usable = (row: CompetitorScoreRow, domain: string) => {
  const quality = row.quality?.[domain];
  return (
    quality &&
    quality.freshness !== "stale" &&
    ((quality.evidence === "positive" && positivePosition(row.ranks[domain]) !== null) ||
      (quality.evidence === "known_absent" && row.ranks[domain] == null))
  );
};

/** Same selected keyword cohort and frozen weights for every selected domain. */
export function competitorShareOfVoice(
  rows: readonly CompetitorScoreRow[],
  selectedDomains: readonly string[],
) {
  const domains = [...new Set(selectedDomains)].sort();
  if (
    domains.length !== selectedDomains.length ||
    rows.length !== new Set(rows.map(({ id }) => id)).size
  ) {
    throw new Error("Duplicate competitor scope identity.");
  }
  const { weights, imputed } = frozenWeights(rows);
  const measured = rows.filter(
    (row) => domains.length > 0 && domains.every((domain) => usable(row, domain)),
  );
  const largest = measured.reduce((max, row) => Math.max(max, weights.get(row.id) ?? 0), 0);
  const scores = new Map(domains.map((domain) => [domain, 0]));
  const counts = new Map(domains.map((domain) => [domain, 0]));
  let weightTotal = 0,
    imputedTotal = 0;
  for (const row of measured) {
    const weight = largest > 0 ? (weights.get(row.id) ?? 0) / largest : 0;
    weightTotal += weight;
    if (imputed.has(row.id)) imputedTotal += weight;
    for (const domain of domains) {
      const position = positivePosition(row.ranks[domain]);
      if (row.quality?.[domain]?.evidence !== "positive" || position === null) continue;
      counts.set(domain, (counts.get(domain) ?? 0) + 1);
      scores.set(domain, (scores.get(domain) ?? 0) + (position <= 10 ? 11 - position : 0) * weight);
    }
  }
  const total = [...scores.values()].reduce((sum, score) => sum + score, 0);
  const fresh = measured.filter((row) =>
    domains.every((domain) => row.quality?.[domain]?.freshness === "fresh"),
  ).length;
  const unknownFreshness = rows.some((row) =>
    domains.some((domain) => !row.quality?.[domain] || row.quality[domain].freshness === "unknown"),
  );
  return {
    definitionVersion: COMPETITOR_SOV_DEFINITION,
    metricId: "competitor_share_of_voice_top10",
    domainSet: domains,
    expected: rows.length,
    measured: measured.length,
    unknown: rows.filter((row) =>
      domains.some(
        (domain) =>
          !row.quality?.[domain] ||
          row.quality[domain].evidence === "unknown" ||
          row.quality[domain].evidence === "not_observed",
      ),
    ).length,
    stale: rows.filter((row) =>
      domains.some((domain) => row.quality?.[domain]?.freshness === "stale"),
    ).length,
    observedCoverage: rows.length ? measured.length / rows.length : null,
    dataCoverage: rows.length && !unknownFreshness ? fresh / rows.length : null,
    imputedWeightShare: weightTotal > 0 ? imputedTotal / weightTotal : null,
    scores,
    counts,
    total,
    shares: new Map(
      domains.map((domain) => [domain, total > 0 ? (scores.get(domain) ?? 0) / total : null]),
    ),
  };
}
