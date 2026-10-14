import "server-only";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { localDigest } from "@/lib/local-monitoring-store/canonical";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { z } from "zod";
import { approvalSnapshotSchema } from "./schema";

const rowSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  monitorId: z.string(),
  scheduleIntentId: z.string(),
  definitionRevisionId: z.string(),
  monitorVersion: z.number().int(),
  actorId: z.string().nullable(),
  snapshot: approvalSnapshotSchema,
  contentHash: z.string(),
  approvalDigest: z.string(),
  approvedAt: z.date(),
  validUntil: z.date(),
});
export type RecurringApproval = z.infer<typeof rowSchema>;
export async function loadRecurringApproval(tx: LocalTransaction, id: string) {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT * FROM local_monitor_recurring_approvals WHERE id=${id}`;
  if (!rows[0]) throw new LocalMonitorConflictError();
  const row = rowSchema.parse(rows[0]);
  if (
    localDigest(row.snapshot) !== row.contentHash ||
    row.snapshot.internalProjectId !== row.projectId ||
    row.snapshot.revisionId !== row.definitionRevisionId ||
    row.monitorVersion !== row.snapshot.expectedVersion + 1 ||
    new Date(row.snapshot.validUntil).getTime() !== row.validUntil.getTime() ||
    (row.actorId !== null && row.actorId !== row.snapshot.actorId)
  )
    throw new LocalMonitorConflictError();
  return row;
}
export async function blockRecurringCursor(
  tx: LocalTransaction,
  id: string,
  reason: string,
  now: Date,
) {
  await tx.$executeRaw`UPDATE local_monitor_recurring_cursors SET state='blocked',reason=${reason},version=version+1,"updatedAt"=${now} WHERE "approvalId"=${id}`;
}
