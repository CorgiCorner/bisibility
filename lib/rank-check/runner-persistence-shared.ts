import "server-only";

import { requiredPublicAuditId, writeAudit } from "@/lib/auth/audit";
import type { Prisma } from "@/lib/generated/prisma/client";
import { RankCheckClosedBeforePersistenceError } from "./persistence-errors";

export async function updateRunningRankCheck(
  tx: Prisma.TransactionClient,
  rankCheckId: string,
  data: Prisma.RankCheckUpdateManyMutationInput,
) {
  const result = await tx.rankCheck.updateMany({
    data,
    where: { id: rankCheckId, status: "running" },
  });
  if (result.count === 0) {
    throw new RankCheckClosedBeforePersistenceError();
  }
  return {
    before: { status: "running" as const },
    rankCheck: await tx.rankCheck.findUniqueOrThrow({ where: { id: rankCheckId } }),
  };
}

export async function writeRankCheckAudit(
  tx: Prisma.TransactionClient,
  input: {
    action: string;
    after: unknown;
    before?: unknown;
    projectId?: string | null;
    rankCheckId: string;
    keywordPublicId: string;
  },
) {
  await writeAudit(
    {
      action: input.action,
      actorId: null,
      after: {
        keywordId: requiredPublicAuditId(input.keywordPublicId, "kw", "Rank-check"),
        ...(input.after as object),
      },
      before: input.before,
      projectId: input.projectId,
      targetId: requiredPublicAuditId(input.rankCheckId, "check", "Rank-check"),
      targetType: "rank_check",
    },
    tx,
  );
}
