import "server-only";

import { prisma } from "@/lib/db/prisma";
import { activeMarketLocationIds, unrunnableKeywordReason } from "@/lib/rank-check/runnable";
import type { SerpDepth } from "@/lib/serp/markets";
import {
  createRunningRankCheckActivity,
  failRankCheckActivity,
  runRankCheckActivity,
} from "@/lib/temporal/rank-check-activities";
import { cancelUnrunnableRunItem } from "./cancel";
import { UnrunnableInlineRankCheckError } from "./launch-types";

export { UnrunnableInlineRankCheckError };

type RunInlineRankCheckInput = {
  depth?: SerpDepth;
  keywordId: string;
  providerId?: string;
  runPublicId: string;
};

export async function runInlineRankCheck(input: RunInlineRankCheckInput) {
  const item = await prisma.rankCheckRunItem.findFirst({
    select: {
      id: true,
      keyword: { select: { archivedAt: true, locationId: true, projectId: true } },
      run: { select: { id: true, projectId: true, requestedCount: true, status: true } },
    },
    where: { keywordId: input.keywordId, run: { publicId: input.runPublicId } },
  });
  if (!item) throw new Error("Rank-check run item not found.");
  // Defence in depth. Today every caller arrives through a guarded launch, so this never fires;
  // it exists so a future caller that creates a run item by another route cannot buy and bill a
  // paused market's keyword. The check runs before the first activity, so nothing is spent.
  const activeLocationIds = await activeMarketLocationIds(item.keyword.projectId, prisma);
  const unrunnable = unrunnableKeywordReason(item.keyword, activeLocationIds);
  if (unrunnable) {
    // The launch already created this item, and refusing without closing it would leave the run
    // queued for a worker that inline execution does not have. That queued item is what
    // `runSelectionKeywordInProgress` reads, so the keyword would look permanently in progress and
    // every later check would be refused with exactly the untruth this path exists to avoid.
    // Cancelling with the named reason costs nothing - the same call the claim loop makes - and
    // leaves the run finalized with a cause the run views already render.
    await prisma.$transaction((tx) =>
      cancelUnrunnableRunItem(tx, {
        itemId: item.id,
        now: new Date(),
        reason: unrunnable,
        run: item.run,
      }),
    );
    throw new UnrunnableInlineRankCheckError(unrunnable);
  }

  const running = await createRunningRankCheckActivity({
    depth: input.depth,
    keywordId: input.keywordId,
    providerId: input.providerId,
    runItemId: item.id,
    scheduleId: null,
    scheduledAt: null,
    trigger: "manual",
    workflowRunId: `inline-${input.runPublicId}`,
  });
  try {
    return await runRankCheckActivity({
      depth: input.depth,
      keywordId: input.keywordId,
      providerId: input.providerId,
      rankCheckId: running.rankCheckId,
      source: "manual",
    });
  } catch (error) {
    await failRankCheckActivity({
      keywordId: input.keywordId,
      message: error instanceof Error ? error.message : "Rank check failed.",
      providerId: input.providerId,
      rankCheckId: running.rankCheckId,
    }).catch(() => undefined);
    throw error;
  }
}
