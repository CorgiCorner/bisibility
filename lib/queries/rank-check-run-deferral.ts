import "server-only";

import { prisma } from "@/lib/db/prisma";
import { type DeferralReasonCode, deferralReasonCode } from "@/lib/rank-check/deferral-reason";

export async function sharedRankCheckRunDeferralCode(
  projectId: string,
  runPublicId: string,
): Promise<DeferralReasonCode | null> {
  const run = await prisma.rankCheckRun.findFirst({
    select: { id: true },
    where: { deletedAt: null, projectId, publicId: runPublicId },
  });
  if (!run) return null;
  const rows = await prisma.rankCheck.findMany({
    distinct: ["deferredReason"],
    select: { deferredReason: true },
    where: { runId: run.id, status: "deferred" },
  });
  const codes = new Set(rows.map((row) => deferralReasonCode(row.deferredReason)));
  if (codes.size !== 1) return null;
  return [...codes][0] ?? null;
}
