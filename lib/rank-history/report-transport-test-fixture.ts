import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import { reportDigest } from "@/lib/rank-reports/digest";
import { rankReportRecords } from "@/lib/rank-reports/records";
import { reportCheck } from "@/lib/rank-reports/report-test-fixture";
import { rankReportTargetResolution } from "@/lib/rank-reports/resolution";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import { loadHistoryExportRuns } from "./export-runs";
import { retainedRunFixture, retainedRunItemFixture } from "./export-runs-test-fixture";
import { historyExportSnapshotFixture } from "./report-export-test-fixture";

/** Real report producer over captured synthetic checks; current definition stays unproved. */
export async function transportHistorySnapshot(
  keywordIds?: readonly string[],
  includeUnobservedRuns = false,
) {
  const snapshot = historyExportSnapshotFixture();
  const target = snapshot.targets[0];
  const keyword = snapshot.keywords[0];
  if (!target || !keyword) throw new Error("Missing transport fixture cohort");
  snapshot.membership = keywordIds
    ? "explicit_selected_retained_history"
    : "full_project_retained_history";
  if (keywordIds && (keywordIds.length !== 1 || keywordIds[0] !== target.id))
    throw new Error("Foreign transport fixture cohort");
  snapshot.policy.freshForMs = 86400000;
  keyword.targetUrl = "https://example.com/today";
  const stale = reportCheck(3, { id: "check_dbcdefghijklmnopqrstuvwx" });
  if (!stale.observationRun) throw new Error("Missing captured stale observation");
  stale.observationRun.requestPolicy = {
    evidence: {
      completeThrough: { organic_result: 100 },
      observedAt: "2026-08-01T10:00:00Z",
      policyRevision: "policy-v1",
      targetRevision: "target-v1",
      version: 1,
    },
  };
  target.checks = [
    ...target.checks,
    reportCheck(null, { id: "check_cbcdefghijklmnopqrstuvwx", rankingUrl: null }),
    stale,
    reportCheck(null, {
      id: "check_ebcdefghijklmnopqrstuvwx",
      observationRun: null,
      rankingUrl: null,
    }),
  ].map((check) => ({
    ...check,
    expectedUrlAtCheck: "https://example.com/expected",
    rankingUrl: check.rankingUrl ? "https://example.com/old" : null,
  }));
  const original = target.checks[0]?.observationRun;
  if (!original) throw new Error("Missing captured normalized observation");
  original.items = [
    {
      id: "retained-normalized-item-db",
      createdAt: new Date("2026-10-12T10:01:00Z"),
      blockPosition: 2,
      businessName: "=literal business",
      cid: "18446744073709551615",
      domain: "example.com",
      mapsUrl: "https://maps.example.com/place",
      ordinal: 3,
      placeId: "opaque-place-id",
      positionInBlock: 1,
      rankAbsolute: 7,
      rankGroup: 3,
      resultKind: "local_pack",
      title: "normalized title",
      url: "https://example.com/saved",
      rankScale: "local_pack_position",
      promotion: "organic",
      sourcePage: 1,
      sourceBlockId: "retained-block-2",
      sourceOrdinal: 3,
      observedAt: new Date("2026-10-12T10:00:00Z"),
    },
  ];
  const resolved = resolveCurrentRankTrackerTargets(
    snapshot.targets,
    snapshot.policy,
    snapshot.project.id,
  );
  snapshot.records = rankReportRecords(
    snapshot.targets,
    snapshot.policy,
    snapshot.project.id,
    "retained_scope",
  );
  snapshot.resolutions = resolved.map((row) => ({
    ...rankReportTargetResolution(row, snapshot.policy),
    currentScopeState: row.currentScopeState,
    lastKnown: rankReportTargetResolution(row.historicalResolution, snapshot.policy),
  }));
  snapshot.summary = summarizeRankReport(resolved, snapshot.policy);
  const runs = ["cancelled", "deferred", "blocked"].map((status, index) =>
    retainedRunFixture({
      id: `run-db-${index}`,
      publicId: `rcr_${["a", "b", "c"][index]}bcdefghijklmnopqrstuvwx`,
      status: status === "deferred" ? "completed" : status,
      outcome: status === "deferred" ? "deferred" : null,
      deferredCount: status === "deferred" ? 1 : 0,
      cancelledCount: status === "cancelled" ? 1 : 0,
    }),
  );
  const items = runs.map((run, index) =>
    retainedRunItemFixture({
      id: `run-item-db-${index}`,
      runId: run.id,
      status: ["cancelled", "deferred", "blocked"][index],
      run: {
        publicId: run.publicId,
        status: run.status,
        outcome: run.outcome,
        updatedAt: run.updatedAt,
      },
    }),
  );
  runs.push(
    retainedRunFixture({
      id: "empty-run-db",
      publicId: "rcr_dbcdefghijklmnopqrstuvwx",
      status: "blocked",
      blockedReason: "budget_exhausted",
      _count: { items: 0 },
      totalCount: 0,
      cancelledCount: 0,
    }),
  );
  const unobserved = includeUnobservedRuns
    ? await loadHistoryExportRuns(
        {
          rankCheckRun: { count: async () => runs.length, findMany: async () => runs },
          rankCheckRunItem: { count: async () => items.length, findMany: async () => items },
        },
        {
          projectId: snapshot.project.id,
          keywordIds: [keyword.id],
          asOf: snapshot.policy.asOf,
          fullProject: !keywordIds,
          capacity: 100,
        },
      )
    : { records: [], unresolvedMembershipCount: 0, source: null };
  snapshot.unobservedRecords = unobserved.records;
  snapshot.unresolvedMembershipCount = unobserved.unresolvedMembershipCount;
  snapshot.sourceDigest = reportDigest({
    targets: snapshot.targets,
    policy: snapshot.policy,
    unobserved: unobserved.source,
  });
  return snapshot;
}
