import "server-only";
import type { LocalTransaction } from "@/lib/local-monitoring-store/context";
import { z } from "zod";
import { nextRecurringSlot, retainedRecurringSlot } from "./calendar";
import type { RecurringApproval } from "./repository";

const cursorSchema = z.object({
  approvalId: z.string(),
  projectId: z.string(),
  nextOccurrenceKey: z.string(),
  nextDueAt: z.date(),
  usedCents: z.string(),
  issuedOccurrences: z.number().int().nonnegative(),
  state: z.enum(["active", "blocked", "finished"]),
  version: z.number().int().nonnegative(),
});
export async function lockedRecurringCursor(tx: LocalTransaction, approval: RecurringApproval) {
  const rows = await tx.$queryRaw<
    unknown[]
  >`SELECT "approvalId","projectId","nextOccurrenceKey","nextDueAt","usedCents"::text AS "usedCents","issuedOccurrences",state,version FROM local_monitor_recurring_cursors WHERE "approvalId"=${approval.id} AND "projectId"=${approval.projectId} FOR UPDATE`;
  const cursor = cursorSchema.parse(rows[0]);
  const slot = retainedRecurringSlot(
    approval.snapshot.calendar,
    approval.monitorId,
    cursor.nextOccurrenceKey,
  );
  if (slot.dueAt.getTime() !== cursor.nextDueAt.getTime())
    throw new Error("Persisted recurring slot changed.");
  return { cursor, slot };
}
export async function advanceRecurringCursor(
  tx: LocalTransaction,
  approval: RecurringApproval,
  after: Date,
  outcome: "queued" | "skipped",
  now: Date,
  cents?: string,
) {
  const next = nextRecurringSlot(approval.snapshot.calendar, approval.monitorId, after);
  await tx.$executeRaw`UPDATE local_monitor_recurring_cursors SET "lastOccurrenceKey"="nextOccurrenceKey","lastOutcome"=${outcome},"nextOccurrenceKey"=${next.occurrenceKey},"nextDueAt"=${next.dueAt},"usedCents"="usedCents"+${cents ?? "0"}::numeric,"issuedOccurrences"="issuedOccurrences"+${outcome === "queued" ? 1 : 0},state=${next.dueAt >= approval.validUntil ? "finished" : "active"},reason=${next.dueAt >= approval.validUntil ? "expired" : null},version=version+1,"updatedAt"=${now} WHERE "approvalId"=${approval.id}`;
}
