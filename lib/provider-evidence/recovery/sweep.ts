import { notificationTransaction } from "@/lib/notifications/transaction";
import { providerRecoveryScope } from "./scope";
import "server-only";
import { prisma } from "@/lib/db/prisma";
import { captureRecoveryCandidate } from "./capture";
import type { AttemptStopReason } from "./predicate";
import { recoverySwitches } from "./switches";

export type WorkflowStopProbe = (checkId: string) => Promise<AttemptStopReason | null>;
/** Current operation discovery only. Historical cursor/backfill is a separate slice. */
export async function sweepRecoveryCandidates(probe: WorkflowStopProbe, now = new Date()) {
  if (!recoverySwitches().capture) return { examined: 0 };
  const waiting = await prisma.providerRecoveryCandidate.findMany({
    where: { ...providerRecoveryScope(), intent: null },
    select: { rankCheckId: true },
    take: 100,
    orderBy: { updatedAt: "asc" },
  });
  const operations = await prisma.providerDispatchIdentity.findMany({
    where: {
      ...providerRecoveryScope(),
      expiresAt: { gt: now },
      operation: { providerOperationEvidence: { is: null } },
    },
    select: { rankCheckId: true },
    take: 100,
    orderBy: { createdAt: "desc" },
  });
  const ids = [...new Set([...waiting, ...operations].map((row) => row.rankCheckId))];
  for (const id of ids) {
    const stopReason = await probe(id).catch(() => null);
    await notificationTransaction(async (tx) => {
      const task = await tx.queuedRankCheckTask.findUnique({
        where: { rankCheckId: id },
        include: { batch: true },
      });
      // Deadline and a terminal batch prove polling stopped, never Temporal termination.
      const pollingStopped = !!task?.batch.terminalAt && task.batch.queueDeadlineAt <= now;
      await captureRecoveryCandidate(
        tx,
        id,
        { stopReason: stopReason ?? undefined, pollingStopped },
        now,
      );
    });
  }
  return { examined: ids.length };
}
