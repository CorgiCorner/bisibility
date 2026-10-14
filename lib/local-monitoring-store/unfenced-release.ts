import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { SubmissionRecord } from "@/lib/local-monitoring/execution-types";
import { ownAdmission } from "@/lib/provider-usage/admission-extension";
import { discardByokEvidence } from "@/lib/provider-usage/byok-evidence";
import type { LocalTransaction } from "./context";
import { assertLocalCustody, type LocalItemCustody } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { assertLocalTargetOwner } from "./ownership";
import { submissionRecordSchema } from "./schema";
import { isUnsentLocalProjection } from "./unsent-projection";

/** Caller holds project/item locks and fresh authority. Only actual Meter cancellation is proof. */
export async function cancelOriginalUnfencedLocalItem(
  tx: LocalTransaction,
  item: LocalItemCustody & { id: string; targetId: string },
  record: SubmissionRecord,
  now: Date,
) {
  if (!isUnsentLocalProjection(record)) throw new LocalMeasurementConflictError();
  if (record.attemptId !== null) {
    const owner = await assertLocalTargetOwner(tx, item.projectId, item.targetId, item.id);
    if (!owner.workerExpiresAt || owner.workerExpiresAt > now)
      throw new LocalMeasurementConflictError();
  }
  const id = await assertLocalCustody(tx, item, record);
  await ownAdmission.cancel(tx, [id]); // Rejects any native first-send fence, including stale Local markers.
  const next =
    record.status === "cancelled"
      ? record
      : submissionRecordSchema.parse({
          ...record,
          version: record.version + 1,
          status: "cancelled",
          cancellationRequested: true,
        }); // Private projection after native release. Preserve the historical attempt identifier.
  if (next !== record) {
    const changed = await tx.localMeasurementRunItem.updateMany({
      where: { id: item.id, projectId: item.projectId, version: record.version },
      data: { record: next as Prisma.InputJsonValue, version: next.version },
    });
    if (changed.count !== 1) throw new LocalMeasurementConflictError();
  }
  await discardByokEvidence(tx, [id]);
  await tx.localMeasurementTargetOwner.deleteMany({
    where: { projectId: item.projectId, targetId: item.targetId, itemId: item.id },
  });
  return next;
}
