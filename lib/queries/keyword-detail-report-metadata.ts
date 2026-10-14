import type { KeywordRow } from "./keyword-row-types";
import type { RankTrackerReportMetadata } from "./rank-tracker-report-model";

/** Captured policy-matching metrics only; an unavailable capture never inherits legacy raw enrichment. */
export function projectKeywordDetailReportMetadata<Row extends KeywordRow>(
  row: Row,
  captured: RankTrackerReportMetadata | undefined,
) {
  const metrics = captured?.metrics ?? {
    cpc: null,
    difficulty: null,
    serpFeatures: [],
    volume: captured?.volume ?? null,
  };
  return {
    ...row,
    cpc: metrics.cpc === null ? "0.00" : metrics.cpc.toFixed(2),
    cpcKnown: metrics.cpc !== null,
    difficulty: metrics.difficulty ?? 0,
    difficultyKnown: metrics.difficulty !== null,
    hasTag: metrics.difficulty !== null,
    serpFeatures: [...metrics.serpFeatures],
    volume: metrics.volume ?? 0,
    volumeKnown: metrics.volume !== null,
  };
}
