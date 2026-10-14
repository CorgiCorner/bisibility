import { aggregateLocalRows } from "@/lib/dashboard-local/aggregate";
import type { LocalReport } from "@/lib/dashboard-local/model";
import { projectLocalRows } from "@/lib/dashboard-local/projection";
import {
  expectedLocalScope,
  localCheck,
  localDecision,
  localFixtureAsOf,
  localFixtureScope,
} from "@/lib/dashboard-local/test-fixtures";
import {
  rankTrackerQualityFixture,
  reportPolicy,
  reportTarget,
} from "./rank-tracker-report-test-fixture";

export function localListFixture(count = 60) {
  const checks = Array.from({ length: count }, (_, index) =>
    localCheck(
      `target-${index}`,
      (index % 3) + 1,
      index % 5 === 0 ? { incomplete: true, absent: true } : {},
    ),
  );
  const decisions = new Map(
    checks
      .filter((check) => check.observationRun?.items.length)
      .map((check) => {
        const decision = localDecision(check);
        return [decision.itemId, decision] as const;
      }),
  );
  const targets = checks.map((check) => ({
    id: check.keywordId,
    publicId: check.keywordId,
    text: "Service",
  }));
  const metadata = new Map(
    targets.map(({ publicId }) => [
      publicId,
      { expectedScope: expectedLocalScope(publicId), freshForMs: 7_200_000 },
    ]),
  );
  const rows = projectLocalRows(targets, checks, decisions, metadata, localFixtureScope);
  const report: LocalReport = {
    ...aggregateLocalRows(rows, localFixtureAsOf),
    rows,
    asOf: localFixtureAsOf.toISOString(),
    retainedChecks: count,
    expected: count,
    excluded: 0,
    selectionDigest: "local-synthetic-selection",
    membership: "current_active_assignment_cohort",
    comparison: "baseline_membership_unavailable",
    subject: {
      name: "Synthetic business",
      locationId: "biz_abcdefghijklmnopqrstuvwx",
      identityRevisionId: "identity-1",
      matcherVersion: "business-matcher-v1",
    },
  };
  const organic = targets.map((target) => {
    const row = rankTrackerQualityFixture({ ...reportTarget(), id: target.publicId }).row;
    return {
      ...row,
      keyword: target.text,
      rankingUrl: "https://example.test/organic-only",
      serpFeatures: ["paa"],
      targetUrl: "https://example.test/organic-target",
    };
  });
  return { report, organic, policy: reportPolicy() };
}
