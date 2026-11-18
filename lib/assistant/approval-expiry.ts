import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";

/** The decision path executes and resumes within one request; past this its request is gone. */
export const APPROVAL_SETTLE_MS = 120_000;
/** A REST operation still running after this is treated as an uncertain outcome. */
export const RUNNING_STALE_MS = 900_000;

/**
 * Releases an awaiting run only when its calls have genuinely lapsed or been abandoned:
 * unanswered proposals past expiry, approved calls that never started, operations stuck
 * running far past any request lifetime, or finished calls whose decision request never
 * resumed the run. Fresh activity is left to the decision path. Commits on its own so a
 * refused decision cannot roll the transition back.
 */
export async function expireAssistantApprovals(
  tx: Prisma.TransactionClient,
  runId: string,
  now = new Date(),
) {
  const settled = new Date(now.getTime() - APPROVAL_SETTLE_MS);
  const lapsed = await tx.assistantToolCall.updateMany({
    where: {
      runId,
      OR: [
        { status: "proposed", expiresAt: { lte: now } },
        { status: "approved", updatedAt: { lte: settled } },
      ],
    },
    data: { status: "expired" },
  });
  // A call that may have reached its operation keeps an uncertain outcome, never "expired".
  await tx.assistantToolCall.updateMany({
    where: {
      runId,
      status: "running",
      updatedAt: { lte: new Date(now.getTime() - RUNNING_STALE_MS) },
    },
    data: { status: "unknown" },
  });
  const open = await tx.assistantToolCall.count({
    where: { runId, status: { in: ["proposed", "approved", "running"] } },
  });
  if (open) return false;
  const latest = await tx.assistantToolCall.aggregate({
    where: { runId },
    _max: { updatedAt: true },
  });
  const quiet = !latest._max.updatedAt || latest._max.updatedAt <= settled;
  if (!lapsed.count && !quiet) return false;
  const [uncertain, expired] = await Promise.all([
    tx.assistantToolCall.count({ where: { runId, status: "unknown" } }),
    tx.assistantToolCall.count({ where: { runId, status: "expired" } }),
  ]);
  const ended = await tx.assistantRun.updateMany({
    where: { id: runId, status: "awaiting_approval" },
    data: uncertain
      ? { status: "unknown", errorCode: "usage_unknown", finishedAt: now }
      : expired
        ? { status: "cancelled", errorCode: "approval_expired", finishedAt: now }
        : { status: "failed", errorCode: "internal", finishedAt: now },
  });
  if (!ended.count) return false;
  await tx.assistantConversation.updateMany({
    where: { activeRunId: runId },
    data: { activeRunId: null },
  });
  return true;
}
