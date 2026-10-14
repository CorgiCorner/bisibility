import type { RankTrackerQualityRow } from "@/lib/queries/rank-tracker-report-model";
import type { RankReportObservation } from "@/lib/rank-reports/records";

export type KeywordDetailBest = {
  comparisonDigest: string;
  definitionOrigin: "current_definition" | "last_known_definition";
  id: string;
  observedAt: string;
  position: number;
  provider: string | null;
  qualifyingCount: number;
  recordedAt: string;
};

/** A retained minimum for one captured definition, never a new current measurement. */
export type KeywordDetailQuality = {
  asOf: string;
  best: KeywordDetailBest | null;
  definitionVersion: string;
  expectedScope: RankReportObservation["configuredScope"];
  keywordId: string;
  latestAttemptProvider: string | null;
  rankQuality: RankTrackerQualityRow["rankQuality"];
  retainedChecks: number;
  sourceDigest: string;
};
