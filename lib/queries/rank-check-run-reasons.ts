import "server-only";
import { prisma } from "@/lib/db/prisma";
import { type DeferralReasonCode, deferralReasonCode } from "@/lib/rank-check/deferral-reason";

export async function rankRunDeferralReasons(projectId: string, runIds: readonly string[]) {
  if (!runIds.length) return new Map<string, DeferralReasonCode[]>();
  const checks = await prisma.rankCheck.findMany({
    where: {
      status: "deferred",
      run: { projectId, publicId: { in: [...runIds] }, deletedAt: null },
    },
    distinct: ["runId", "deferredReason"],
    select: { deferredReason: true, run: { select: { publicId: true } } },
  });
  const result = new Map<string, DeferralReasonCode[]>();
  for (const check of checks) {
    if (!check.run) continue;
    const reasons = result.get(check.run.publicId) ?? [];
    const reason = deferralReasonCode(check.deferredReason);
    if (!reasons.includes(reason)) reasons.push(reason);
    result.set(check.run.publicId, reasons);
  }
  return result;
}
