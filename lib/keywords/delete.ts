import "server-only";

import { parsePublicId } from "@/lib/db/public-id";
import type { Prisma } from "@/lib/generated/prisma/client";
import { lockProjectForProviderMutation } from "@/lib/provider-allocations/project-lock";
import { reconcilePlannedRunsForSchedule } from "@/lib/rank-check/planner/reconcile-schedule";
import { cancelRunItemsForKeywordDeletion } from "@/lib/rank-check/runs/cancel";
import { activeSnapshotExtensionWhere } from "@/lib/serp/snapshot-extension-active";

/** App and API deletion share the same membership lock and run lifecycle. */
export async function deleteKeywordTargets(
  tx: Prisma.TransactionClient,
  projectId: string,
  publicIds: string[],
) {
  if (publicIds.some((id) => parsePublicId(id)?.prefix !== "kw"))
    throw new Error("Keyword not found.");
  await lockProjectForProviderMutation(tx, projectId);
  const selected = await tx.keyword.findMany({
    select: {
      checkScheduleId: true,
      id: true,
      publicId: true,
      text: true,
      rankChecks: { select: { id: true }, take: 1, where: activeSnapshotExtensionWhere() },
    },
    where: { projectId, publicId: { in: publicIds } },
  });
  if (selected.some((keyword) => keyword.rankChecks?.length))
    throw new Error(
      "A snapshot extension is still running. Wait for it to finish before deleting the keyword.",
    );
  const keywordIds = selected.map((keyword) => keyword.id);
  await cancelRunItemsForKeywordDeletion(tx, keywordIds);
  await tx.keyword.deleteMany({ where: { id: { in: keywordIds } } });
  const scheduleIds = new Set(
    selected.flatMap((keyword) => (keyword.checkScheduleId ? [keyword.checkScheduleId] : [])),
  );
  for (const scheduleId of scheduleIds) await reconcilePlannedRunsForSchedule(scheduleId, tx);
  return selected.map(
    ({ checkScheduleId: _scheduleId, rankChecks: _checks, ...keyword }) => keyword,
  );
}
