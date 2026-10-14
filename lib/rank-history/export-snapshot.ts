import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query-types";
import { loadRankTrackerMetadataBatches } from "@/lib/queries/rank-tracker-metadata-batches";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { validateRankTrackerReportPolicy } from "@/lib/queries/rank-tracker-report-policy";
import { resolveCurrentRankTrackerTargets } from "@/lib/queries/rank-tracker-report-resolve";
import { selectRankTrackerReportKeywordsInTransaction } from "@/lib/queries/rank-tracker-report-selection";
import { authorizeRankReportScope, type RankReportDatabase } from "@/lib/rank-reports/access";
import { loadRetainedRankReportTargets } from "@/lib/rank-reports/database";
import { reportDigest } from "@/lib/rank-reports/digest";
import {
  RankReportCapacityError,
  RankReportSelectionError,
  RankReportSnapshotConflictError,
} from "@/lib/rank-reports/errors";
import { rankReportRequestSchema } from "@/lib/rank-reports/model";
import { snapshotRankReportPolicy } from "@/lib/rank-reports/policy";
import { rankReportRecords } from "@/lib/rank-reports/records";
import { rankReportTargetResolution } from "@/lib/rank-reports/resolution";
import { summarizeRankReport } from "@/lib/rank-reports/summary";
import {
  assertHistoryExportCredential,
  type HistoryExportAuthority,
  snapshotHistoryExportAuthority,
} from "./export-authority";
import { loadHistoryExportRuns } from "./export-runs";

/** Counts and every row share one RepeatableRead snapshot. The full resolver has an explicit cap. */
export async function loadHistoryExportSnapshot(
  sourceContext: HistoryExportAuthority,
  input: {
    projectId: string;
    keywordIds?: readonly string[];
    query?: RankTrackerQueryState;
    includeUnobservedRuns?: boolean;
    includeNormalizedItems?: boolean;
  },
  options: RankTrackerReportOptions,
  db: RankReportDatabase = prisma,
) {
  const context = snapshotHistoryExportAuthority(sourceContext);
  input = structuredClone(input);
  const asOf = new Date(options.asOf.getTime());
  const policy = snapshotRankReportPolicy(options.policyAt(asOf));
  const limits = { ...options.limits };
  if (
    !Number.isFinite(asOf.getTime()) ||
    policy.asOf.getTime() !== asOf.getTime() ||
    Object.values(limits).some((n) => !Number.isSafeInteger(n) || n < 1)
  )
    throw new RankReportCapacityError();
  return db.$transaction(
    async (tx) => {
      const project = await tx.project.findFirst({
        where: { OR: [{ id: input.projectId }, { publicId: input.projectId }] },
        select: { id: true, publicId: true },
      });
      if (!project) throw new RankReportSelectionError();
      validateRankTrackerReportPolicy(policy, asOf, limits, project.publicId);
      const base = {
        projectId: project.publicId,
        selectedIds: [],
        pageLimit: 1,
        stream: "observations",
        window: { basis: "recorded_at", from: new Date(0).toISOString(), to: asOf.toISOString() },
      };
      const empty = rankReportRequestSchema.parse(base);
      await assertHistoryExportCredential(tx, context, project);
      const authorized = await authorizeRankReportScope(tx, context, empty, asOf);
      if (input.query && input.keywordIds !== undefined) throw new RankReportSelectionError();
      const filtered = input.query
        ? await selectRankTrackerReportKeywordsInTransaction(
            tx,
            context,
            { projectRef: project.publicId, query: input.query },
            options,
          )
        : null;
      const selectedIds = filtered ? filtered.selectedKeywordIds : input.keywordIds;
      const where = {
        projectId: project.id,
        createdAt: { lte: asOf },
        ...(selectedIds ? { publicId: { in: [...selectedIds] } } : {}),
      };
      if ((selectedIds?.length ?? 0) > limits.maxTargets) throw new RankReportCapacityError();
      const keywords = await tx.keyword.findMany({
        where,
        take: limits.maxTargets + 1,
        orderBy: [{ createdAt: "desc" }, { publicId: "desc" }],
        select: {
          id: true,
          publicId: true,
          createdAt: true,
          updatedAt: true,
          device: true,
          location: true,
          text: true,
          targetUrl: true,
          topic: true,
          intent: true,
          tags: { select: { tag: { select: { name: true } } } },
        },
      });
      if (keywords.length > limits.maxTargets) throw new RankReportCapacityError();
      const count = keywords.length;
      if (keywords.some((row) => row.updatedAt > asOf)) throw new RankReportSnapshotConflictError();
      if (
        selectedIds &&
        (new Set(selectedIds).size !== selectedIds.length || selectedIds.length !== count)
      )
        throw new RankReportSelectionError();
      rankReportRequestSchema.parse({
        ...base,
        selectedIds: keywords.map(({ publicId }) => publicId),
      });
      // This exact query already established project ownership under the freshly authorized snapshot.
      const scope = {
        ...authorized,
        keywords: keywords.map(({ createdAt, id, publicId }) => ({ createdAt, id, publicId })),
      };
      const metadata = await loadRankTrackerMetadataBatches(
        options.loadMetadata,
        tx,
        project,
        scope.keywords,
        asOf,
      );
      const targets = await loadRetainedRankReportTargets(
        tx,
        scope,
        policy,
        limits,
        metadata,
        input.includeNormalizedItems ?? false,
      );
      const resolved = resolveCurrentRankTrackerTargets(targets, policy, project.id);
      const unobserved = input.includeUnobservedRuns
        ? await loadHistoryExportRuns(tx, {
            projectId: project.id,
            keywordIds: keywords.map((row) => row.id),
            asOf,
            fullProject: selectedIds === undefined,
            capacity: limits.maxChecks - targets.reduce((n, target) => n + target.checks.length, 0),
          })
        : { records: [], unresolvedMembershipCount: 0, source: null };
      const sourceDigest = reportDigest({
        keywords: keywords.map((row) => ({
          ...row,
          tags: [...row.tags].sort((a, b) => a.tag.name.localeCompare(b.tag.name)),
        })),
        targets,
        metadata: [...metadata].sort(([a], [b]) => a.localeCompare(b)),
        policy,
        query: input.query ?? null,
        unobserved: unobserved.source,
      });
      return {
        asOf: asOf.toISOString(),
        keywords,
        policy,
        project,
        sourceDigest,
        targets,
        membership: input.query
          ? ("current_active_filtered_query" as const)
          : selectedIds
            ? ("explicit_selected_retained_history" as const)
            : ("full_project_retained_history" as const),
        records: rankReportRecords(targets, policy, project.id, "retained_scope"),
        unobservedRecords: unobserved.records,
        unresolvedMembershipCount: unobserved.unresolvedMembershipCount,
        normalizedItemLimit: limits.maxItems,
        resolutions: resolved.map((target) => ({
          ...rankReportTargetResolution(target, policy),
          currentScopeState: target.currentScopeState,
          lastKnown: rankReportTargetResolution(target.historicalResolution, policy),
        })),
        summary: summarizeRankReport(resolved, policy),
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export type HistoryExportSnapshot = Awaited<ReturnType<typeof loadHistoryExportSnapshot>>;
