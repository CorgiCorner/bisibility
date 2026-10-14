import "server-only";

import { businessReadProjectScope } from "@/lib/business-location-store/access";
import { businessDigest } from "@/lib/business-location-store/canonical";
import type {
  BusinessStoreContext,
  BusinessTransaction,
} from "@/lib/business-location-store/context";
import { retainedBusinessObservationSelect } from "@/lib/business-location-store/observation-read";
import { businessMatcherVersion } from "@/lib/business-locations/dto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { overviewComparisonDays } from "@/lib/queries/overview-filters";
import { loadRankTrackerMetadataBatches } from "@/lib/queries/rank-tracker-metadata-batches";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { RankTrackerReportConfigurationError } from "@/lib/queries/rank-tracker-report-model";
import { validateRankTrackerReportPolicy } from "@/lib/queries/rank-tracker-report-policy";
import {
  RankReportCapacityError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import type { RankReportLimits } from "@/lib/rank-reports/model";
import { snapshotRankReportPolicy } from "@/lib/rank-reports/policy";
import { aggregateLocalRows } from "./aggregate";
import { localAssignmentCohort } from "./cohort";
import type { LocalReadFilters, LocalReport } from "./model";
import { projectLocalRows } from "./projection";
import type { DashboardLocalSelection } from "./selection";
import { resolveDashboardLocalSubject } from "./subject";

const runSelect = {
  ...retainedBusinessObservationSelect,
  createdAt: true,
  completeness: true,
  configuredScope: true,
  effectiveScope: true,
  executedAt: true,
  items: {
    ...retainedBusinessObservationSelect.items,
    select: { ...retainedBusinessObservationSelect.items.select, createdAt: true },
  },
} satisfies Prisma.ObservationRunSelect;
const checkSelect = {
  id: true,
  publicId: true,
  keywordId: true,
  createdAt: true,
  updatedAt: true,
  checkedAt: true,
  normalizationVersion: true,
  requestedDepth: true,
  status: true,
  provider: true,
  position: true,
  observationRun: { select: runSelect },
} satisfies Prisma.RankCheckSelect;
export type LocalRetainedCheck = Prisma.RankCheckGetPayload<{ select: typeof checkSelect }>;

async function readChecks(
  tx: BusinessTransaction,
  projectId: string,
  ids: string[],
  entityId: string,
  asOf: Date,
  limits: RankReportLimits,
) {
  const where = { keyword: { projectId }, keywordId: { in: ids }, createdAt: { lte: asOf } };
  const itemWhere = { observationRun: { projectId, rankCheck: where } };
  const [checkCount, itemCount] = await Promise.all([
    tx.rankCheck.count({ where }),
    tx.observationItem.count({ where: itemWhere }),
  ]);
  if (checkCount > limits.maxChecks || itemCount > limits.maxItems)
    throw new RankReportCapacityError();
  const checks = await tx.rankCheck.findMany({
    where,
    select: checkSelect,
    orderBy: { id: "asc" },
    take: limits.maxChecks,
  });
  if (
    checks.length !== checkCount ||
    checks.some(
      (check) =>
        check.updatedAt > asOf ||
        (check.observationRun &&
          (check.observationRun.createdAt > asOf ||
            check.observationRun.items.some((item) => item.createdAt > asOf))),
    )
  )
    throw new RankReportSnapshotConflictError();
  const matchWhere = {
    projectId,
    entityId,
    observationRunId: {
      in: checks.flatMap((check) => (check.observationRun ? [check.observationRun.id] : [])),
    },
    recordedAt: { lte: asOf },
  };
  const matchCount = await tx.businessMatchDecision.count({ where: matchWhere });
  if (matchCount > limits.maxChecks) throw new RankReportCapacityError();
  const decisions = await tx.businessMatchDecision.findMany({
    where: matchWhere,
    orderBy: [{ decisionRevision: "desc" }, { id: "desc" }],
    take: limits.maxChecks,
  });
  if (decisions.length !== matchCount) throw new RankReportSnapshotConflictError();
  // All revisions are retained, but only the latest decision as of this snapshot is authoritative.
  const latest = new Map<string, (typeof decisions)[number]>();
  for (const decision of decisions)
    if (!latest.has(decision.itemId)) latest.set(decision.itemId, decision);
  return { checks, latest };
}

/** Caller owns the read-only RepeatableRead snapshot; all scope and policy reads occur inside it. */
export async function readLocalReportInTransaction(
  tx: BusinessTransaction,
  projectRef: string,
  context: BusinessStoreContext,
  selection: DashboardLocalSelection,
  filters: LocalReadFilters,
  options: RankTrackerReportOptions,
): Promise<LocalReport> {
  const { asOf, limits } = options;
  if (
    !Number.isFinite(asOf.getTime()) ||
    Object.values(limits).some((value) => !Number.isSafeInteger(value) || value < 1)
  )
    throw new RankReportCapacityError();
  const policy = snapshotRankReportPolicy(options.policyAt(asOf));
  validateRankTrackerReportPolicy(policy, asOf, limits, projectRef);
  if (
    policy.baseline.mode === "before" &&
    asOf.getTime() - policy.baseline.before.getTime() !==
      overviewComparisonDays(filters.range) * 86_400_000
  )
    throw new RankTrackerReportConfigurationError();
  const scope = await businessReadProjectScope(tx, context, projectRef, "business_assignment");
  // Entity matches have their own capability, checked with the same fresh membership.
  await businessReadProjectScope(tx, context, projectRef, "entity_match");
  const subject = await resolveDashboardLocalSubject(tx, scope, selection, asOf);
  const cohort = await localAssignmentCohort(
    tx,
    scope,
    selection,
    subject,
    filters,
    limits.maxTargets,
    asOf,
  );
  const metadata = await loadRankTrackerMetadataBatches(
    options.loadMetadata,
    tx,
    scope.project,
    cohort.included,
    asOf,
  );
  const { checks, latest } = await readChecks(
    tx,
    scope.project.id,
    cohort.included.map(({ id }) => id),
    subject.row.id,
    asOf,
    limits,
  );
  const rows = projectLocalRows(cohort.included, checks, latest, metadata, {
    projectId: scope.project.id,
    entityId: subject.row.id,
    identityRevisionId: selection.identityRevisionId,
    asOf,
    policy,
  });
  const selectionDigest = businessDigest({
    projectId: scope.project.publicId,
    selection,
    filters,
    ids: cohort.included.map(({ publicId }) => publicId),
    asOf: asOf.toISOString(),
  });
  return {
    asOf: asOf.toISOString(),
    selectionDigest,
    subject: {
      locationId: selection.locationId,
      name: subject.location.currentRevision.snapshot.name,
      identityRevisionId: selection.identityRevisionId,
      matcherVersion: businessMatcherVersion,
    },
    membership: "current_active_assignment_cohort",
    comparison: "baseline_membership_unavailable",
    expected: rows.length,
    excluded: cohort.exclusions.length,
    retainedChecks: checks.length,
    ...aggregateLocalRows(rows, asOf),
    rows,
  };
}
