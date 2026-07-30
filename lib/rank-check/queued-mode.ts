import "server-only";

import { prisma } from "@/lib/db/prisma";
import {
  dispatcherClaimsAllowed,
  type RankCheckSchedulerMode,
  rankCheckSchedulerMode,
} from "./scheduler-mode";

const PAID_OR_AMBIGUOUS_STATES = new Set(["ambiguous", "ready", "submitted", "submitting"]);
const TERMINAL_STATES = new Set(["completed", "deferred", "failed"]);

export type QueuedRankCheckModeAuthorization = {
  allowPaidRetrieval: boolean;
  allowPrepare: boolean;
  allowSubmit: boolean;
  existingState: string | null;
  mode: RankCheckSchedulerMode;
  reason: string | null;
};

export function queuedRankCheckModeAuthorization(
  mode: RankCheckSchedulerMode,
  existingState: string | null,
): QueuedRankCheckModeAuthorization {
  if (dispatcherClaimsAllowed(mode)) {
    return {
      allowPaidRetrieval: true,
      allowPrepare: true,
      allowSubmit: true,
      existingState,
      mode,
      reason: null,
    };
  }
  const terminal = existingState !== null && TERMINAL_STATES.has(existingState);
  const allowPaidRetrieval =
    mode === "cutover" && existingState !== null && PAID_OR_AMBIGUOUS_STATES.has(existingState);
  return {
    allowPaidRetrieval,
    allowPrepare: mode === "cutover" ? existingState !== null : terminal,
    allowSubmit: false,
    existingState,
    mode,
    reason:
      mode === "cutover"
        ? "queued_submission_disabled_in_cutover"
        : "queued_dispatch_disabled_in_legacy",
  };
}

export async function authorizeQueuedRankCheckBatch(
  batchId: string,
): Promise<QueuedRankCheckModeAuthorization> {
  const batch = await prisma.queuedRankCheckBatch.findUnique({
    select: { state: true },
    where: { id: batchId },
  });
  return queuedRankCheckModeAuthorization(rankCheckSchedulerMode(), batch?.state ?? null);
}
