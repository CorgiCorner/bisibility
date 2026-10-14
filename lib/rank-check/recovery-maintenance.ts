import "server-only";
import { prisma } from "@/lib/db/prisma";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { meteringNamespace } from "@/lib/metering/runtime";
import { RetainedRankResultUnreadableError } from "./recovery-evidence";
import { restoreRetainedRankResult } from "./recovery-restore";
import { resultRecoveryCutoff } from "./recovery-result-grace";
import { saveResultRecoveryHealth } from "./recovery-result-health";

/** Only ready-to-save results are restored. No provider client is reachable here. */
export async function maintainRetainedRankResults(now = new Date()) {
  const scope = { namespace: meteringNamespace(), instanceId: recoveryInstance() };
  await prisma.rankCheckResultEvidence.deleteMany({ where: { ...scope, expiresAt: { lte: now } } });
  const rows = await prisma.rankCheckResultEvidence.findMany({
    where: {
      ...scope,
      blockedCode: null,
      expiresAt: { gt: now },
      createdAt: { lte: resultRecoveryCutoff(now) },
    },
    orderBy: { createdAt: "asc" },
    take: 10,
    select: { rankCheckId: true },
  });
  let restored = 0;
  for (const row of rows) {
    try {
      if (
        await prisma.$transaction(
          (tx) => restoreRetainedRankResult(tx, row.rankCheckId, null, now),
          { timeout: 30000 },
        )
      )
        restored++;
    } catch (error) {
      // Prevent one malformed envelope from starving later rows. It remains visible for triage.
      if (error instanceof RetainedRankResultUnreadableError)
        await prisma.rankCheckResultEvidence.updateMany({
          where: { rankCheckId: row.rankCheckId },
          data: { blockedCode: "result_unreadable" },
        });
    }
  }
  await prisma.$transaction((tx) => saveResultRecoveryHealth(tx, scope.namespace, restored));
  return { restored };
}
