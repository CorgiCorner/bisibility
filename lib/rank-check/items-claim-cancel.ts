import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { type ClaimCandidate, claimCandidateRun } from "./items-claim-types";
import { unrunnableClaimReason } from "./runnable";
import { cancelUnrunnableRunItem } from "./runs/cancel";

/**
 * Splits the claimed page into the rows that may still run and the rows whose market was paused
 * or whose keyword was archived after they were queued. The second group is cancelled with a
 * named reason and a zero cost instead of being dispatched to a provider.
 */
export async function cancelUnrunnableCandidates(
  tx: Prisma.TransactionClient,
  selected: ClaimCandidate[],
  now: Date,
) {
  const runnable: ClaimCandidate[] = [];
  const cancelledProjectIds = new Set<string>();
  for (const candidate of selected) {
    const reason = unrunnableClaimReason(candidate);
    if (!reason) {
      runnable.push(candidate);
      continue;
    }
    const cancelled = await cancelUnrunnableRunItem(tx, {
      itemId: candidate.id,
      now,
      reason,
      run: claimCandidateRun(candidate),
    });
    if (!cancelled) continue;
    cancelledProjectIds.add(candidate.projectId);
    await writeAudit(
      {
        action: "rank_check_run.item_cancelled",
        actorId: null,
        after: {
          itemId: candidate.id,
          keywordId: requiredPublicAuditId(candidate.keywordPublicId, "kw", "Rank-check"),
          reason,
        },
        projectId: candidate.projectId,
        targetId: requiredPublicAuditId(candidate.runPublicId, "rcr", "Rank-check run"),
        targetType: "rank_check_run",
      },
      tx,
    );
  }
  return { cancelledProjectIds, runnable };
}
