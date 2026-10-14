import { fixtureScope } from "@/lib/rank-measurements/fixtures";
import type { RecordedMeasurementCheck } from "@/lib/rank-measurements/recorded-check";
import { recordedFixture } from "@/lib/rank-measurements/recorded-fixtures";

export const keywordObservationSelect = {
  projectId: true,
  completeness: true,
  configuredScope: true,
  effectiveScope: true,
  requestPolicy: true,
  provider: true,
  surface: true,
  engine: true,
  executedAt: true,
  createdAt: true,
};

type CheckOverrides = Partial<RecordedMeasurementCheck> & {
  errorCode?: string | null;
  previousPosition?: number | null;
  rankingUrl?: string | null;
};

export function keywordRankCheck(overrides: CheckOverrides = {}) {
  const at = overrides.checkedAt ?? new Date("2026-06-20T08:00:00.000Z");
  const position = overrides.position === undefined ? 7 : overrides.position;
  const scope = {
    ...fixtureScope,
    projectId: "project_1",
    targetId: "keyword_1",
    location: "United States",
  };
  return {
    ...recordedFixture(position, {
      id: `check-${at.toISOString()}`,
      configuredScope: scope,
      effectiveScope: scope,
      normalizationVersion: "v2",
      observedAt: at,
      recordedAt: at,
    }),
    rankingUrl: "https://example.com/old",
    ...overrides,
  };
}
