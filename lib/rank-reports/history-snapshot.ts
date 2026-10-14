import "server-only";
import { prisma } from "@/lib/db/prisma";
import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  authorizeRankReportScope,
  type RankReportContext,
  type RankReportDatabase,
  snapshotRankReportContext,
} from "./access";
import { loadRetainedRankReportTargets } from "./database";
import { RankReportSelectionError, RankReportSnapshotConflictError } from "./errors";
import type { RetainedHistorySnapshot, SavedFeatureFact } from "./history-contract";
import { rankReportRequestSchema } from "./model";
import { snapshotRankReportPolicy } from "./policy";
import { rankReportRecords } from "./records";
import type { RankReportReadOptions } from "./service";

/** Only this saved check is read. Raw payloads and current provider fetches are never projected. */
export async function readRetainedHistorySnapshotFor(
  context: RankReportContext,
  input: { projectId: string; keywordId: string; checkId: string; asOf: string },
  options: RankReportReadOptions,
  db: RankReportDatabase = prisma,
): Promise<RetainedHistorySnapshot> {
  if (!isPublicIdOfType(input.checkId, "check")) throw new RankReportSelectionError();
  const request = rankReportRequestSchema.parse({
    pageLimit: 1,
    projectId: input.projectId,
    selectedIds: [input.keywordId],
    stream: "observations",
    window: { basis: "recorded_at", from: input.asOf, to: input.asOf },
  });
  const asOf = new Date(request.window.to);
  if (asOf > new Date()) throw new RankReportSnapshotConflictError();
  const verified = snapshotRankReportContext(context);
  const policy = snapshotRankReportPolicy(options.policyAt(asOf));
  if (policy.asOf.getTime() !== asOf.getTime()) throw new RankReportSnapshotConflictError();
  return db.$transaction(
    async (tx) => {
      const scope = await authorizeRankReportScope(tx, verified, request, asOf);
      const metadata = await options.loadMetadata(tx, scope, asOf);
      const targets = await loadRetainedRankReportTargets(
        tx,
        scope,
        policy,
        options.limits,
        metadata,
        true,
        input.checkId,
      );
      const record = rankReportRecords(targets, policy, scope.project.id, "retained_scope").find(
        ({ observation }) => observation?.id === input.checkId,
      );
      if (!record?.observation) throw new RankReportSelectionError();
      const featureFacts: SavedFeatureFact[] = ["local_pack", "ai_overview"].map((feature) => {
        const sourceItemIds = record.items
          .filter((item) => item.resultKind === feature)
          .map(({ id }) => id);
        return {
          checkId: input.checkId,
          feature,
          presence: sourceItemIds.length ? "present" : "unknown",
          sourceItemIds,
          ownership: "unknown",
          identityRevision: null,
        };
      });
      return {
        asOf: asOf.toISOString(),
        projectId: scope.project.publicId,
        observation: record.observation,
        items: record.items,
        detailState: record.items.length ? "retained" : "not_stored",
        featureFacts,
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
