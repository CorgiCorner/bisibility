import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import {
  LocalOperationConflict,
  type LocalOperationStore,
  type SubmissionClaim,
} from "@/lib/local-monitoring/execution-types";
import {
  applySubmissionEvent,
  assertSubmissionBinding,
} from "@/lib/local-monitoring/submission-state";
import type { LocalDatabase } from "./context";
import { assertLocalCustody, assertLocalPossibleSend } from "./custody";
import { releaseProvenLocalOwner } from "./ownership";
import { lockedLocalItem } from "./repository";
import { submissionRecordSchema } from "./schema";

/** Internal continuation bound to an admitted run, not a public/API query scope. */
export function localOperationStore(
  db: LocalDatabase,
  projectId: string,
  runId: string,
): LocalOperationStore {
  return {
    async read(key) {
      const item = await db.localMeasurementRunItem.findFirst({
        where: { projectId, runId, operationKey: key },
      });
      if (!item) return null;
      const record = submissionRecordSchema.parse(item.record);
      if (
        record.version !== item.version ||
        record.scope.projectId !== projectId ||
        record.key !== key ||
        record.provider !== item.provider ||
        (record.attemptId !== null && record.attemptId !== item.preparedAttemptId)
      )
        throw new Error("Retained item record binding changed.");
      return record;
    },
    async claim(input: SubmissionClaim) {
      const record = await this.read(input.key);
      if (!record) throw new Error("Joined taskset admission is required before continuation.");
      assertSubmissionBinding(record, input);
      return { fresh: false, record }; // No durable replay or restarted factory grants a new send.
    },
    async apply(key, expectedVersion, event) {
      return db.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM projects WHERE id=${projectId} FOR UPDATE`;
        const { item, record } = await lockedLocalItem(tx, projectId, key);
        if (item.runId !== runId || record.version !== expectedVersion)
          throw new LocalOperationConflict();
        if (event.kind !== "cancel") {
          await assertLocalCustody(tx, item, record);
          if (event.attemptId !== item.preparedAttemptId)
            throw new Error("Event does not belong to the original prepared attempt.");
        }
        if (event.kind === "reconciled")
          throw new Error("Trusted host proof verification is required for reconciliation.");
        if (event.kind === "possible_send")
          throw new Error("Use the joined first-dispatch transaction.");
        if (event.kind === "settlement") {
          if (!record.settlementRecorded) throw new Error("Use joined canonical Meter settlement.");
          return record;
        }
        if (event.kind === "outcome") await assertLocalPossibleSend(tx, item);
        if (event.kind === "collected") {
          const evidence = await tx.observationRun.findFirst({
            where: { id: event.evidenceId, projectId, neutralExecutionItemId: item.id },
            select: { id: true },
          });
          if (!evidence) throw new Error("Collected evidence does not belong to the neutral item.");
        }
        const run = await tx.localMeasurementRun.findFirst({ where: { id: runId, projectId } });
        if (!run) throw new Error("Original run is unavailable.");
        const next = submissionRecordSchema.parse(applySubmissionEvent(record, event));
        const changed = await tx.localMeasurementRunItem.updateMany({
          where: { id: item.id, projectId, runId, version: expectedVersion },
          data: { version: next.version, record: next as Prisma.InputJsonValue },
        });
        if (changed.count !== 1) throw new LocalOperationConflict();
        await releaseProvenLocalOwner(tx, item, next);
        return next;
      });
    },
  };
}
