import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { LocalJournalPort } from "@/lib/local-monitoring/execution-types";
import { applySubmissionEvent } from "@/lib/local-monitoring/submission-state";
import type { OwnAttemptGrant } from "@/lib/provider-usage/admission-extension-types";
import type { ProviderRequest } from "@usagekit/providers";
import { localProjectScope } from "./access";
import { localRequestHash } from "./canonical";
import type { LocalDatabase, LocalHostPorts, LocalRunBinding, LocalStoreContext } from "./context";
import { assertLocalCustody } from "./custody";
import { LocalMeasurementConflictError } from "./errors";
import { settleLocalItem } from "./item-settlement";
import { fenceLocalGrant } from "./meter-fence";
import { assertLocalTargetOwner } from "./ownership";
import { lockedLocalItem } from "./repository";
import { type LocalLaunchCommand, localRunSelection } from "./run-selection";
import { submissionRecordSchema } from "./schema";

/** A first-send permit exists only inside the successful admission process. Never reconstructed. */
export function preparedLocalJournal(input: {
  db: LocalDatabase;
  context: LocalStoreContext;
  command: LocalLaunchCommand;
  ports: LocalHostPorts;
  projectId: string;
  runId: string;
  key: string;
  workerToken: string;
  grant: OwnAttemptGrant;
  request: ProviderRequest;
  taskset: readonly OwnAttemptGrant[];
  binding?: LocalRunBinding;
}): LocalJournalPort {
  let prepared = false;
  let dispatchStarted = false;
  let fenced = false;
  const requestHash = localRequestHash(input.request);
  return {
    async prepare(value) {
      if (
        prepared ||
        value.attemptKey !== input.key ||
        localRequestHash(value.request) !== requestHash ||
        !input.grant.pricedRequest
      )
        throw new LocalMeasurementConflictError();
      prepared = true; // A failed continuation also consumes the only in-process send permit.
      return {
        attemptId: input.grant.attemptId,
        request: input.grant.pricedRequest,
      };
    },
    async beforeDispatch(id) {
      if (!prepared || dispatchStarted || fenced || id !== input.grant.attemptId)
        throw new LocalMeasurementConflictError();
      dispatchStarted = true; // An ambiguous commit response never grants another first-dispatch attempt.
      await input.db.$transaction(async (tx) => {
        const scope = await localProjectScope(tx, input.context, input.command.projectId, "update");
        await input.binding?.verify(tx, scope);
        if (scope.project.id !== input.projectId) throw new LocalMeasurementConflictError();
        const { item, record } = await lockedLocalItem(tx, input.projectId, input.key);
        const run = await tx.localMeasurementRun.findFirst({
          where: { id: input.runId, projectId: input.projectId },
        });
        if (
          item.runId !== input.runId ||
          !run ||
          run.cancellationRequested ||
          record.cancellationRequested ||
          record.status !== "claimed" ||
          record.outcome !== null ||
          record.attemptId !== null ||
          item.preparedLeaseId !== input.grant.leaseId ||
          item.requestHash !== requestHash
        )
          throw new LocalMeasurementConflictError();
        const owner = await assertLocalTargetOwner(tx, input.projectId, item.targetId, item.id);
        if (
          owner.version !== 0 ||
          owner.workerToken !== input.workerToken ||
          !owner.workerExpiresAt ||
          owner.workerExpiresAt <= input.ports.clock()
        )
          throw new LocalMeasurementConflictError();
        await assertLocalCustody(tx, item, record);
        await localRunSelection(tx, scope, input.command, input.ports);
        const requests = input.taskset.map((grant) => {
          if (!grant.pricedRequest) throw new LocalMeasurementConflictError();
          return grant.pricedRequest;
        });
        await input.ports.activation.assertPreparedTaskset(tx, {
          quote: input.command.quote,
          requests,
        });
        await fenceLocalGrant(tx, input.grant);
        const next = submissionRecordSchema.parse(
          applySubmissionEvent(record, { kind: "possible_send", attemptId: id }),
        );
        const changed = await tx.localMeasurementRunItem.updateMany({
          where: {
            id: item.id,
            projectId: input.projectId,
            runId: input.runId,
            version: record.version,
          },
          data: { record: next as Prisma.InputJsonValue, version: next.version },
        });
        if (changed.count !== 1) throw new LocalMeasurementConflictError();
      });
      fenced = true;
    },
    async settle(id, receipt) {
      if (!prepared || !fenced || id !== input.grant.attemptId)
        throw new LocalMeasurementConflictError();
      await settleLocalItem(input.db, input.projectId, input.runId, input.key, receipt);
    },
  };
}
