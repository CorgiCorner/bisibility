import "server-only";

import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function skipPlannedRun(
  tx: Prisma.TransactionClient,
  runId: string,
  now = new Date(),
) {
  const cancelled = await tx.rankCheckRun.updateMany({
    // This run never entered the active set, so the reconciler intentionally never owns it.
    data: { finishedAt: now, status: "cancelled" },
    where: { id: runId, status: "planned" },
  });
  if (cancelled.count === 0) return false;
  return true;
}

export function skipPlannedRunById(runId: string, now = new Date()) {
  return prisma.$transaction((tx) => skipPlannedRun(tx, runId, now));
}

export async function runPlannedRunNow(runId: string, now = new Date()) {
  const queued = await prisma.rankCheckRun.updateMany({
    data: { plannedFor: now, status: "queued" },
    where: { id: runId, status: "planned" },
  });
  return queued.count > 0;
}
