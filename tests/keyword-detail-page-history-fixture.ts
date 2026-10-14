import { historyPages } from "@/components/keyword-detail-history/history.test-fixture";
import { projectKeywordDetailQuality } from "@/lib/keyword-detail/quality-projector";
import { detailCheck, detailTarget } from "@/lib/keyword-detail/quality-test-fixture";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import { rankTrackerQualityFixture } from "@/lib/queries/rank-tracker-report-test-fixture";
import type { HistoryWindow } from "@/lib/rank-reports/history-contract";
import { reportPolicy, reportProject } from "@/lib/rank-reports/report-test-fixture";

/** Route wiring fixture: rank state is supplied by the shared kernel, not legacy position101. */
export function detailRouteFixture(
  scope: { keywordId: string },
  window: HistoryWindow,
  metadata: Partial<KeywordRow> & Record<string, unknown>,
) {
  const checks =
    metadata.checkState === "never_checked"
      ? []
      : metadata.checkState === "not_ranked"
        ? [detailCheck(1, null), detailCheck(0, 5)]
        : [detailCheck(0, 3)];
  const source = detailTarget(checks);
  const target = {
    ...source,
    id: scope.keywordId,
    expectedScope: source.expectedScope
      ? { ...source.expectedScope, targetId: scope.keywordId }
      : null,
  };
  const projected = projectKeywordDetailQuality(
    { ...rankTrackerQualityFixture().row, ...metadata, id: scope.keywordId },
    [target],
    reportPolicy(),
    reportProject.id,
    "route-fixture-snapshot",
  );
  const pages = historyPages();
  const envelope = { asOf: projected.quality.asOf, sourceDigest: projected.quality.sourceDigest };
  return {
    keyword: { ...metadata, ...projected.row },
    quality: projected.quality,
    history: {
      observations: { ...pages.observations, ...envelope, window },
      attempts: {
        ...pages.attempts,
        ...envelope,
        window: { ...window, basis: "recorded_at" as const },
      },
    },
  };
}
