import "server-only";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db/prisma";
import { makePublicId } from "@/lib/db/public-id-resources";
import type { Prisma } from "@/lib/generated/prisma/client";
import { LocalTargetBlocked } from "@/lib/local-monitoring/execution-types";
import { assertLocalQuote, localQuoteHash } from "@/lib/local-monitoring/quote";
import { initialSubmission } from "@/lib/local-monitoring/submission-state";
import { operationKey } from "@/lib/local-monitoring/target-key";
import { targetOperationScope } from "@/lib/local-monitoring/target-operation";
import { meteringNamespace } from "@/lib/metering/runtime";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { ownTransportRef } from "@/lib/metering/transport-own-admission";
import { localProjectScope } from "./access";
import { auditLocal } from "./audit";
import { freezeLocalInput, localDigest, localRequestHash, requireLocalTime } from "./canonical";
import type { LocalDatabase, LocalHostPorts, LocalRunBinding, LocalStoreContext } from "./context";
import { LocalMeasurementConflictError, LocalMeasurementUnavailableError } from "./errors";
import { admitLocalRequests, localPaidAttemptId } from "./meter-admission";
import { claimLocalTargetOwner } from "./ownership";
import { localRunSelection } from "./run-selection";
import { launchLocalSchema } from "./schema";

/** Full frozen selection is one atomic ownership + current Meter admission taskset. */
export async function admitLocalMeasurementRun(
  command: unknown,
  context: LocalStoreContext,
  ports: LocalHostPorts,
  db: LocalDatabase = prisma,
  binding?: LocalRunBinding,
) {
  const data = freezeLocalInput(launchLocalSchema.parse(command));
  return db.$transaction(async (tx) => {
    const scope = await localProjectScope(tx, context, data.projectId, "create");
    const keyHash = localDigest([data.idempotencyKey]);
    const bodyHash = localDigest([
      scope.actor.id,
      {
        ...data,
        targetIds: [...data.targetIds].sort(),
        idempotencyKey: undefined,
      },
    ]);
    const retained = await tx.localMeasurementRun.findFirst({
      where: {
        projectId: scope.project.id,
        operation: "local_scan_submit",
        keyHash,
      },
    });
    if (retained) {
      if (
        retained.actorId !== scope.actor.id ||
        retained.bodyHash !== bodyHash ||
        retained.quoteHash !== localQuoteHash(data.quote)
      )
        throw new LocalMeasurementConflictError();
      await binding?.replay(tx, scope, retained);
      return { fresh: false as const, run: retained, prepared: [] };
    }
    await binding?.verify(tx, scope);
    const { selected, quoteHash, now } = await localRunSelection(tx, scope, data, ports);
    const connection = await tx.providerConnection.findFirst({
      where: { projectId: scope.project.id, publicId: data.connectionId },
      select: {
        id: true,
        provider: true,
        enabled: true,
        status: true,
        credentialSource: true,
        kind: true,
      },
    });
    if (
      !connection ||
      !connection.enabled ||
      connection.status !== "connected" ||
      connection.credentialSource !== "own" ||
      connection.kind !== "serp" ||
      connection.provider !== data.quote.provider
    )
      throw new LocalMeasurementUnavailableError();
    const scan = {
      projectId: scope.project.id,
      operation: "local_scan_submit" as const,
      idempotencyKey: data.idempotencyKey,
    };
    const operations = selected.map(({ target, row }) => ({
      targetKey: row.targetKey,
      operationKey: operationKey(targetOperationScope(scan, target)),
    }));
    const suppliedBindings = await ports.activation.verifyConsent(tx, {
      actorId: scope.actor.id,
      projectId: scope.project.id,
      connectionPublicId: data.connectionId,
      quote: data.quote,
      targets: selected.map(({ target }) => target),
      operations,
      now,
    });
    const bindings = freezeLocalInput(structuredClone(suppliedBindings));
    if (
      bindings.length !== selected.length ||
      new Set(bindings.map(({ targetKey }) => targetKey)).size !== selected.length
    )
      throw new Error("Incomplete frozen taskset custody.");
    const frozen = selected.map((value, index) => {
      const binding = bindings.find(({ targetKey }) => targetKey === value.row.targetKey)?.binding;
      const key = operations[index]?.operationKey;
      if (
        !binding ||
        !key ||
        binding.connectionId !== connection.id ||
        binding.projectId !== scope.project.id ||
        binding.provider !== connection.provider ||
        binding.attribution.context.projectId !== scope.project.id ||
        binding.attribution.context.feature !== "local_scan" ||
        binding.attribution.context.source !== data.source ||
        binding.attribution.context.trigger !== data.trigger ||
        !binding.credentialVersion
      )
        throw new LocalMeasurementConflictError();
      const request = structuredClone(
        ports.adapter.buildRequest({
          target: value.target,
          point: value.point,
          quote: data.quote,
        }),
      );
      return {
        ...value,
        binding,
        key,
        request,
        itemId: randomUUID(),
        workerToken: randomUUID(),
        childScope: targetOperationScope(scan, value.target),
      };
    });
    if (
      new Set(frozen.map(({ binding }) => binding.attribution.context.correlationId)).size !==
      frozen.length
    )
      throw new Error("Recovery requires one durable correlation per item.");
    for (const value of frozen) {
      const owner = await tx.localMeasurementTargetOwner.findFirst({
        where: { projectId: scope.project.id, targetId: value.row.id },
      });
      if (owner) {
        const blocked = await tx.localMeasurementRunItem.findFirst({
          where: { projectId: scope.project.id, id: owner.itemId },
          select: { operationKey: true },
        });
        throw new LocalTargetBlocked(blocked?.operationKey ?? "retained-owner");
      }
    }
    const run = await tx.localMeasurementRun.create({
      data: {
        publicId: makePublicId("lmr"),
        projectId: scope.project.id,
        operation: "local_scan_submit",
        keyHash,
        bodyHash,
        actorId: scope.actor.id,
        quote: data.quote as Prisma.InputJsonValue,
        quoteHash,
        expectedTargetKeys: [...data.quote.expectedTargetKeys].sort(),
        source: data.source,
        trigger: data.trigger,
      },
    });
    await binding?.created(tx, scope, run);
    const grants = await admitLocalRequests(tx, frozen);
    if (grants.length !== frozen.length) throw new Error("Incomplete canonical taskset grant.");
    const priced = grants.map((grant) => {
      if (!grant.pricedRequest) throw new Error("Current Meter priced grant is missing.");
      return grant.pricedRequest;
    });
    await ports.activation.assertPreparedTaskset(tx, {
      quote: data.quote,
      requests: priced,
    });
    for (const request of priced) await ports.adapter.assertPreparedQuote(request, data.quote);
    const prepared = [];
    for (const [index, value] of frozen.entries()) {
      const grant = grants[index];
      if (!grant || grant.attemptId !== localPaidAttemptId(value.binding, value.key))
        throw new LocalMeasurementConflictError();
      assertLocalQuote({
        quote: data.quote,
        target: value.target,
        capability: ports.adapter.capability,
        providerPriceVersion: ports.adapter.providerPriceVersion,
        now: requireLocalTime(ports.clock()),
      });
      const record = initialSubmission({
        key: value.key,
        scope: value.childScope,
        targetKey: value.row.targetKey,
        quoteHash,
        provider: data.quote.provider,
        adapterVersion: data.quote.adapterVersion,
        providerPriceVersion: data.quote.providerPriceVersion,
      });
      const item = await tx.localMeasurementRunItem.create({
        data: {
          id: value.itemId,
          projectId: scope.project.id,
          runId: run.id,
          targetId: value.row.id,
          operationKey: value.key,
          bodyHash: localDigest([bodyHash, value.row.targetKey]),
          record: record as Prisma.InputJsonValue,
          connectionId: value.binding.connectionId,
          provider: value.binding.provider,
          credentialVersion: value.binding.credentialVersion,
          correlationId: value.binding.attribution.context.correlationId,
          namespace: meteringNamespace(),
          preparedAttemptId: grant.attemptId,
          preparedLeaseId: grant.leaseId,
          requestHash: localRequestHash(value.request),
        },
      });
      const operation = await readPaidOperation(
        await createTransactionMeter(tx),
        await ownTransportRef(tx, grant.attemptId),
      );
      if (!operation.lease || operation.lease.leaseId !== grant.leaseId)
        throw new LocalMeasurementConflictError();
      await claimLocalTargetOwner(tx, scope.project.id, value.row.id, item.id, {
        token: value.workerToken,
        expiresAt: new Date(operation.lease.expiresAt),
      });
      prepared.push({
        itemId: item.id,
        key: value.key,
        grant,
        request: value.request,
        target: value.target,
        point: value.point,
        record,
        workerToken: value.workerToken,
      });
    }
    await auditLocal(tx, scope, {
      action: "local_measurement.launch",
      targetType: "local_measurement_run",
      targetId: run.publicId,
      after: {
        state: "claimed",
        version: run.version,
        count: prepared.length,
        keyHash,
        bodyHash,
        quoteHash,
      },
    });
    return { fresh: true as const, run, prepared };
  });
}
export type LocalRunAdmission = Awaited<ReturnType<typeof admitLocalMeasurementRun>>;
