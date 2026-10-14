import "server-only";
import type { LocalMeasurementTarget } from "@/lib/generated/prisma/client";
import type { ExecutionTargetV1 } from "@/lib/local-monitoring/types";
import type { LocalTransaction } from "./context";
import { LocalDeviceNotConfiguredError, LocalMeasurementConflictError } from "./errors";
import { localKeywordSelect } from "./repository";

/** Original already-sent continuation only. Never used by admission or first-send selection. */
export async function assertRetainedLocalKeywordDevice(
  tx: LocalTransaction,
  row: Pick<LocalMeasurementTarget, "projectId" | "keywordId" | "keywordSnapshot">,
  target: ExecutionTargetV1,
) {
  if (row.projectId !== target.projectId) throw new LocalMeasurementConflictError();
  if (row.keywordId === null) {
    const snapshot = row.keywordSnapshot;
    if (
      !snapshot ||
      typeof snapshot !== "object" ||
      Array.isArray(snapshot) ||
      snapshot.id !== target.keywordId ||
      snapshot.device !== target.device
    )
      throw new LocalMeasurementConflictError();
    return; // DB-only FK tombstone; original frozen device remains evidence, not runnable current intent.
  }
  if (row.keywordId !== target.keywordId) throw new LocalMeasurementConflictError();
  await tx.$queryRaw`SELECT id FROM keywords WHERE id=${row.keywordId} AND "projectId"=${row.projectId} FOR SHARE`;
  const keyword = await tx.keyword.findFirst({
    where: { id: row.keywordId, projectId: row.projectId, archivedAt: null },
    select: localKeywordSelect,
  });
  if (!keyword || keyword.device !== target.device) throw new LocalDeviceNotConfiguredError();
}
