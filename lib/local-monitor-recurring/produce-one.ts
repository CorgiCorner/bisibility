import "server-only";
import { randomUUID } from "node:crypto";
import { AuthorizationError } from "@/lib/auth/authorize";
import { makePublicId, requirePublicId } from "@/lib/db/public-id-resources";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { occurrenceBody, occurrenceKey } from "@/lib/local-monitor-launch/identity";
import { LocalMonitorConflictError } from "@/lib/local-monitor-store/model";
import { monitorWorkerPolicy } from "@/lib/local-monitor-worker/policy";
import { localProjectScope } from "@/lib/local-monitoring-store/access";
import type { LocalDatabase } from "@/lib/local-monitoring-store/context";
import { nextRecurringSlot } from "./calendar";
import { advanceRecurringCursor, lockedRecurringCursor } from "./cursor";
import { assertRecurringQuote } from "./limits";
import { prepareRecurringOccurrence } from "./prepare";
import { blockRecurringCursor, loadRecurringApproval } from "./repository";

const policyReasons = new Set([
  "price_or_scope_changed",
  "ceiling_exhausted",
  "unsupported",
  "capability_unregistered",
  "connection_unavailable",
  "pricing_unavailable",
]);
/** Same project lock as manual admission; one due cursor produces at most one immutable job. */
export async function produceRecurringOccurrence(id: string, db: LocalDatabase, now: Date) {
  return db.$transaction(async (tx) => {
    const approval = await loadRecurringApproval(tx, id);
    await tx.$queryRaw`SELECT id FROM projects WHERE id=${approval.projectId} FOR UPDATE`;
    const { cursor, slot } = await lockedRecurringCursor(tx, approval);
    if (cursor.state !== "active" || cursor.nextDueAt > now) return "not_due" as const;
    if (!approval.actorId || approval.validUntil <= now) {
      await blockRecurringCursor(tx, id, "expired", now);
      return "blocked" as const;
    }
    try {
      const scope = await localProjectScope(
        tx,
        { actor: { id: approval.actorId } },
        approval.snapshot.projectId,
        "create",
      );
      if (
        now >= nextRecurringSlot(approval.snapshot.calendar, approval.monitorId, slot.dueAt).dueAt
      ) {
        await advanceRecurringCursor(tx, approval, now, "skipped", now);
        return "skipped" as const;
      }
      const busy = await tx.$queryRaw<
        Array<{ busy: boolean }>
      >`SELECT (EXISTS(SELECT 1 FROM local_measurement_target_owners o JOIN local_measurement_targets t ON t.id=o."targetId" AND t."projectId"=o."projectId" WHERE o."projectId"=${approval.projectId} AND t."publicId"=ANY(${approval.snapshot.targetIds}::text[])) OR EXISTS(SELECT 1 FROM local_monitor_launch_intents j CROSS JOIN LATERAL jsonb_array_elements_text(j.command->'targetIds') target(value) WHERE j."projectId"=${approval.projectId} AND j.state IN ('queued','running') AND target.value=ANY(${approval.snapshot.targetIds}::text[]))) AS busy`;
      if (busy[0]?.busy) return "target_retained" as const;
      const prepared = await prepareRecurringOccurrence(
        tx,
        scope,
        approval,
        slot.occurrenceKey,
        now,
      );
      // Persist only validated public target identities at this trusted database projection boundary.
      const command = {
        ...prepared,
        targetIds: prepared.targetIds.map((id) => requirePublicId(id, "lmt")),
      };
      const cents = assertRecurringQuote(
          approval.snapshot,
          command.quote,
          cursor.usedCents,
          cursor.issuedOccurrences,
        ),
        policy = monitorWorkerPolicy(now),
        jobId = randomUUID();
      const expiresAt = new Date(
        Math.min(Date.parse(command.quote.expiresAt), approval.validUntil.getTime()),
      );
      await tx.$executeRaw`INSERT INTO local_monitor_launch_intents(id,"publicId","projectId","monitorId","actorId",command,"bodyHash","keyHash","connectionStamp","consentDigest","approvedAt","expiresAt","pollIntervalMs","collectionDeadline",origin,"recurringApprovalId","recurringOccurrenceKey",state,"createdAt","updatedAt") VALUES (${jobId},${makePublicId("lmj")},${approval.projectId},${approval.monitorId},${approval.actorId},${JSON.stringify(command)}::jsonb,${occurrenceBody(command, approval.actorId)},${occurrenceKey(command)},${approval.snapshot.connectionStamp},${approval.approvalDigest},${now},${expiresAt},${policy.pollIntervalMs},${policy.collectionDeadline},'scheduled',${approval.id},${slot.occurrenceKey},'queued',${now},${now})`;
      await advanceRecurringCursor(tx, approval, slot.dueAt, "queued", now, cents);
      return "queued" as const;
    } catch (error) {
      const known =
        error instanceof AuthorizationError ||
        error instanceof ProjectReadOnlyError ||
        error instanceof LocalMonitorConflictError ||
        (error instanceof Error && policyReasons.has(error.message));
      if (!known) throw error;
      const reason =
        error instanceof AuthorizationError || error instanceof ProjectReadOnlyError
          ? "access_revoked"
          : error instanceof LocalMonitorConflictError
            ? "source_changed"
            : error.message;
      await blockRecurringCursor(tx, id, reason, now);
      return "blocked" as const;
    }
  });
}
