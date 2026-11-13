import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { queueNotificationAfterCommit } from "@/lib/notifications/transaction";
import { isRestoredCheck } from "@/lib/rank-check/restored-check";
import { routingAncestors, type SummaryTarget } from "./collect";
import { recomputeCheckSummary, summaryKey } from "./deliver";
import { routeCheckSummary } from "./routing";
import { checkNotificationSummariesEnabled } from "./switch";
import { checkWindow, summaryWritable } from "./window";

type Flight = { running: Promise<number>; followUp?: Promise<number> };
const flights = new Map<string, Flight>();
function begin(key: string, target: SummaryTarget) {
  const flight: Flight = { running: (async () => recomputeCheckSummary(target))() };
  flights.set(key, flight);
  const finish = () => {
    if (flights.get(key) === flight) flights.delete(key);
  };
  flight.running.then(finish, finish);
  return flight.running;
}
/**
 * A recomputation holds a pool connection while it waits for its per-key lock. Every finished
 * check requests one, so parallel checks of one run or window would fill the pool with requests
 * that only queue on that lock. In one process a summary is therefore recomputed one at a time,
 * and the requests that arrive meanwhile share a single follow-up. It starts after the running
 * one ends, so it still reads the state each of those requests committed.
 */
function recomputeSummary(target: SummaryTarget) {
  const key = summaryKey(target);
  const flight = flights.get(key);
  if (!flight) return begin(key, target);
  const followUp = () => begin(key, target);
  flight.followUp ??= flight.running.then(followUp, followUp);
  return flight.followUp;
}

export async function recomputeSummaryForRun(runId: string) {
  if (!checkNotificationSummariesEnabled()) return;
  const run = await prisma.rankCheckRun.findUnique({ where: { id: runId } });
  if (!run) return;
  await recomputeSummary({ kind: "manual", projectId: run.projectId, runId });
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
      await recomputeSummary({
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
