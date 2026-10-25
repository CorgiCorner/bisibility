import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { queueNotificationAfterCommit } from "@/lib/notifications/transaction";
import { isRestoredCheck } from "@/lib/rank-check/restored-check";
import { routingAncestors } from "./collect";
import { recomputeCheckSummary } from "./deliver";
import { routeCheckSummary } from "./routing";
import { checkNotificationSummariesEnabled } from "./switch";
import { checkWindow, summaryWritable } from "./window";

export async function recomputeSummaryForRun(runId: string) {
  if (!checkNotificationSummariesEnabled()) return;
  const run = await prisma.rankCheckRun.findUnique({ where: { id: runId } });
  if (!run) return;
  await recomputeCheckSummary({ kind: "manual", projectId: run.projectId, runId });
}

export async function recomputeSummaryForCheck(checkId: string) {
  if (!checkNotificationSummariesEnabled()) return;
  const check = await prisma.rankCheck.findUnique({
    where: { id: checkId },
    include: { run: true, keyword: { select: { projectId: true } } },
  });
  if (!check || isRestoredCheck(check)) return;
  const ancestors = await routingAncestors(prisma, check.run ? [check.run] : []);
  const route = routeCheckSummary(check.trigger, check.run, ancestors);
  if (route.kind === "manual") {
    await recomputeSummaryForRun(route.runId);
  } else if (route.kind === "scheduled") {
    const window = checkWindow(check);
    if (summaryWritable(window.end, new Date()))
      await recomputeCheckSummary({
        kind: "scheduled",
        projectId: check.keyword.projectId,
        window,
      });
  }
}

export function queueCheckSummary(tx: Prisma.TransactionClient, checkId: string) {
  if (!checkNotificationSummariesEnabled()) return;
  queueNotificationAfterCommit(tx, () => recomputeSummaryForCheck(checkId));
}

export function queueRunSummary(tx: Prisma.TransactionClient, runId: string) {
  if (!checkNotificationSummariesEnabled()) return;
  queueNotificationAfterCommit(tx, () => recomputeSummaryForRun(runId));
}
