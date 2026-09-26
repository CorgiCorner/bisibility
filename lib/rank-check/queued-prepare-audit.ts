import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";

export async function writeQueuedRunningAudit(
  tx: Prisma.TransactionClient,
  input: {
    estimatedCostCents: number;
    deferredReason: string | null;
    keywordPublicId: string;
    projectId: string;
    publicId: string;
  },
) {
  await writeAudit(
    {
      action: input.deferredReason ? "rank_check.deferred" : "rank_check.running",
      actorId: null,
      after: {
        estimatedCostCents: input.deferredReason ? 0 : input.estimatedCostCents,
        keywordId: requiredPublicAuditId(input.keywordPublicId, "kw", "Rank-check"),
        provider: "dataforseo",
        ...(input.deferredReason ? { reason: input.deferredReason } : {}),
        status: input.deferredReason ? "deferred" : "running",
      },
      projectId: input.projectId,
      targetId: requiredPublicAuditId(input.publicId, "check", "Rank-check"),
      targetType: "rank_check",
    },
    tx,
  );
}
