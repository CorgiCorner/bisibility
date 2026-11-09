import { CapacityLimitError } from "@/lib/capacity/errors";
import { prepareKeywordScheduleChange } from "@/lib/capacity/schedule-change";
import type { Prisma } from "@/lib/generated/prisma/client";
import { isOperationAccessDeniedError } from "@/lib/operations/access-error";
import {
  type CheckScheduleRow,
  mirrorManualToKeywords,
  mirrorScheduleToKeywords,
} from "./service-membership";

/** Deleting a schedule remains possible without silently admitting disallowed recurring work. */
export async function transferOnScheduleDelete(
  tx: Prisma.TransactionClient,
  projectId: string,
  keywordIds: string[],
  fallback: CheckScheduleRow,
) {
  if (keywordIds.length === 0) return fallback.publicId;
  try {
    const capacity = await prepareKeywordScheduleChange(tx, projectId, keywordIds, fallback);
    await tx.keyword.updateMany({
      data: { checkScheduleId: fallback.id },
      where: { id: { in: keywordIds } },
    });
    await mirrorScheduleToKeywords(tx, projectId, fallback, keywordIds);
    await capacity.check();
    return fallback.publicId;
  } catch (error) {
    if (!(error instanceof CapacityLimitError) && !isOperationAccessDeniedError(error)) throw error;
    await tx.keyword.updateMany({
      data: { checkScheduleId: null },
      where: { id: { in: keywordIds } },
    });
    await mirrorManualToKeywords(tx, projectId, keywordIds);
    return null;
  }
}
