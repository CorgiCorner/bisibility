import "server-only";
import type { PaidFenceHook, PaidFenceReference } from "@/lib/metering/paid-attempt-types";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { attributableSource } from "@/lib/rank-check/run-attribution";
import { sameDefinitionBytes } from "./canonical";
import { DefinitionUnavailableError } from "./errors";
import type { DefinitionOwner, DefinitionProducerPorts, DefinitionTransaction } from "./model";
import { lockDefinitionSource, readDefinitionSource } from "./storage";
import { assertDefinitionExecutionPermit, type DefinitionExecutionPermit } from "./worker-claim";
import { assertDefinitionRunCredential } from "./worker-credential";

export type WorkerDefinitionScope = Readonly<{
  permit: DefinitionExecutionPermit;
  projectId: string;
  keywordId: string;
  providerId: string;
  connectionId: string;
  credentialSource: "own" | "hosted";
  credentialVersion: string | null;
  owner: DefinitionOwner;
}>;
type ExecutionRow = {
  requestedById: string | null;
  runId: string;
  itemId: string;
  trigger: string;
  credentialKind: string | null;
  credentialId: string | null;
  selectionKind: string;
  selectionSpec: unknown;
  principal: DefinitionExecutionPermit["principal"];
  scheduleId: string | null;
  schedulePublicId: string | null;
  scheduleEpoch: string | null;
};

/** A proof is visible only within this native callback's transaction, never portable request data. */
export function definitionWorkerHost(
  scope: WorkerDefinitionScope,
  ports: Pick<DefinitionProducerPorts, "recordMutation" | "assertImplementedAdapter"> & {
    assertEntitlement: (tx: DefinitionTransaction, projectId: string) => Promise<void>;
  },
) {
  assertDefinitionExecutionPermit(scope.permit);
  const dispatch = new WeakMap<object, readonly PaidFenceReference[]>();
  const host: DefinitionProducerPorts = {
    ...ports,
    async assertOwnExecution(tx, owner, input, stage) {
      if (
        owner.rankCheckId !== scope.owner.rankCheckId ||
        owner.executionKey !== scope.owner.executionKey ||
        owner.queuedTaskId !== scope.owner.queuedTaskId ||
        input.projectId !== scope.projectId ||
        input.keywordId !== scope.keywordId ||
        input.providerId !== scope.providerId
      )
        throw new DefinitionUnavailableError();
      if (stage === "dispatch") {
        const references = dispatch.get(tx);
        if (!references?.length || references.some((ref) => !nativeReferenceMatches(scope, ref)))
          throw new DefinitionUnavailableError();
        for (const ref of references) {
          const [prepared] = await tx.$queryRaw<
            Array<{ bindingId: string }>
          >`SELECT "bindingId" FROM measurement_native_request_proofs WHERE "operationId"=${ref.operation.operationId} AND "bindingId" IN (SELECT id FROM measurement_execution_bindings WHERE "projectId"=${scope.projectId} AND "keywordId"=${scope.keywordId} AND "rankCheckId"=${scope.owner.rankCheckId} AND "executionKey"=${scope.owner.executionKey})`;
          if (!prepared) throw new DefinitionUnavailableError();
          await tx.$executeRaw`INSERT INTO measurement_native_dispatch_proofs (namespace,principal,"operationId","leaseId","bindingId") VALUES (${ref.operation.scope.namespace},${ref.operation.scope.principal},${ref.operation.operationId},${ref.lease.leaseId},${prepared.bindingId})`;
        }
      }
      await lockWorkerDefinitionScope(tx, scope);
      const rows = await tx.$queryRaw<ExecutionRow[]>`
        SELECT r."requestedById",r.id AS "runId",i.id AS "itemId",r.trigger,r."credentialKind",r."credentialId",
          r."selectionKind",r."selectionSpec",measurement_worker_principal(c.id) AS principal,s.id AS "scheduleId",s."publicId" AS "schedulePublicId",s."measurementEpoch"::text AS "scheduleEpoch"
        FROM rank_checks c JOIN keywords k ON k.id=c."keywordId"
        JOIN projects p ON p.id=k."projectId" JOIN users u ON u.id=p."ownerId"
        JOIN rank_check_run_items i ON i."rankCheckId"=c.id AND i."keywordId"=k.id AND i."runId"=c."runId"
        JOIN rank_check_runs r ON r.id=i."runId" AND r."projectId"=p.id
        LEFT JOIN check_schedules s ON s.id=k."checkScheduleId" AND s."projectId"=p.id
        WHERE c.id=${scope.owner.rankCheckId} AND k.id=${scope.keywordId} AND p.id=${scope.projectId}
          AND c.status='running' AND i.status='running' AND r.status IN ('queued','running')
          AND c."definitionExecutionToken"=${scope.permit.token} AND c."definitionWorkflowId"=${scope.permit.workflowId}
          AND c."workflowRunId"=${scope.permit.workflowRunId} AND p."writeMode"='active' AND NOT p."isSample"
          AND u."deactivatedAt" IS NULL AND k."archivedAt" IS NULL
          AND EXISTS(SELECT 1 FROM project_markets m WHERE m."projectId"=p.id AND m."locationId"=k."locationId" AND m.status='active')
        FOR UPDATE OF c`;
      if (rows.length !== 1) throw new DefinitionUnavailableError();
      const row = rows[0];
      if (!sameDefinitionBytes(row.principal, scope.permit.principal))
        throw new DefinitionUnavailableError();
      const connection = await tx.providerConnection.findUnique({
        where: { id: scope.connectionId },
        select: {
          projectId: true,
          provider: true,
          credentialSource: true,
          credentialsEncrypted: true,
          enabled: true,
          status: true,
        },
      });
      if (
        !connection ||
        connection.projectId !== scope.projectId ||
        connection.provider !== scope.providerId ||
        !connection.enabled ||
        connection.status !== "connected" ||
        connection.credentialSource !== scope.credentialSource ||
        (scope.credentialSource === "own" &&
          ownCredentialVersion(
            scope.providerId,
            scope.connectionId,
            connection.credentialsEncrypted,
          ) !== scope.credentialVersion)
      )
        throw new DefinitionUnavailableError();
      const queuedBatchId = scope.owner.queuedTaskId
        ? await assertQueuedExecution(tx, scope)
        : null;
      await ports.assertEntitlement(tx, scope.projectId);
      await assertDefinitionRunCredential(tx, scope.projectId, row);
      if (row.requestedById !== null) return { kind: "user", actorId: row.requestedById };
      if (row.credentialKind === "project_key" && row.credentialId)
        return {
          kind: "project_credential",
          actorId: null,
          projectId: scope.projectId,
          runId: row.runId,
          runItemId: row.itemId,
          credentialKind: "project_key",
          credentialId: row.credentialId,
        };
      if (row.credentialKind !== null || row.credentialId !== null)
        throw new DefinitionUnavailableError();
      if (
        row.trigger !== "scheduled" ||
        !["scheduled_due", "legacy_schedule"].includes(row.selectionKind)
      )
        throw new DefinitionUnavailableError();
      const selection = row.selectionSpec as {
        checkScheduleId?: unknown;
        kind?: unknown;
        queuedDefinitionBatchId?: unknown;
        dispatchClaims?: unknown;
      } | null;
      if (
        row.selectionKind === "scheduled_due" &&
        (selection?.kind !== "scheduled_due" ||
          selection.checkScheduleId !== row.schedulePublicId ||
          !row.scheduleId)
      )
        throw new DefinitionUnavailableError();
      if (row.selectionKind === "legacy_schedule") {
        const source = await readDefinitionSource(tx, scope.projectId, scope.keywordId);
        if (
          (source.policy.checkSchedule ?? source.policy.keywordSchedule ?? source.policy.defaults)
            ?.frequency === "monthly"
        )
          throw new DefinitionUnavailableError();
      }
      if (
        row.selectionKind === "scheduled_due" &&
        scope.permit.principal.checkScheduleId !== row.scheduleId
      )
        throw new DefinitionUnavailableError();
      if (queuedBatchId && row.selectionKind === "legacy_schedule")
        await assertLegacyQueuedClaim(tx, scope.keywordId, queuedBatchId, selection);
      return {
        kind: "scheduler",
        actorId: null,
        runId: row.runId,
        runItemId: row.itemId,
        scheduleId: row.scheduleId,
        scheduleEpoch: row.scheduleEpoch,
      };
    },
  };
  const withinNativeFence = (
    body: (tx: DefinitionTransaction) => Promise<void>,
  ): PaidFenceHook => ({
    async lockBusiness(tx, references) {
      if (!references.length || references.some((ref) => !nativeReferenceMatches(scope, ref)))
        throw new DefinitionUnavailableError();
      await lockWorkerDefinitionScope(tx, scope);
    },
    async assertDispatch(tx, references) {
      if (!references.length || references.some((ref) => !nativeReferenceMatches(scope, ref)))
        throw new DefinitionUnavailableError();
      dispatch.set(tx, references);
      try {
        await body(tx);
      } finally {
        dispatch.delete(tx);
      }
    },
  });
  return { host, withinNativeFence };
}
export function nativeReferenceMatches(scope: WorkerDefinitionScope, ref: PaidFenceReference) {
  return (
    ref.context.projectId === scope.projectId &&
    ref.context.connectionId === scope.connectionId &&
    ref.context.keywordId === scope.keywordId &&
    ref.context.rankCheckId === scope.owner.rankCheckId &&
    ref.context.correlationId === (scope.owner.queuedTaskId ?? scope.owner.rankCheckId) &&
    ref.context.rankCheckRunId === scope.permit.principal.runId &&
    ref.context.rankCheckRunItemId === scope.permit.principal.runItemId &&
    ref.operation.source === attributableSource(scope.permit.principal.source) &&
    ref.context.trigger ===
      (scope.permit.principal.trigger === "scheduled" ? "scheduled" : "manual") &&
    (scope.permit.principal.credentialId === null && scope.permit.principal.credentialKind === null
      ? ref.operation.scope.accessCredential == null
      : ref.operation.scope.accessCredential?.id === scope.permit.principal.credentialId &&
        ref.operation.scope.accessCredential?.kind === scope.permit.principal.credentialKind) &&
    ref.operation.provider === scope.providerId &&
    ref.operation.fundingSource === (scope.credentialSource === "own" ? "byok" : "platform") &&
    ref.operation.state === "dispatch_intended" &&
    ref.operation.lease?.leaseId === ref.lease.leaseId
  );
}
async function assertQueuedExecution(tx: DefinitionTransaction, scope: WorkerDefinitionScope) {
  const rows = await tx.$queryRaw<Array<{ id: string }>>`
    SELECT b.id FROM queued_rank_check_tasks t JOIN queued_rank_check_batches b ON b.id=t."batchId"
    WHERE t.id=${scope.owner.queuedTaskId} AND t."rankCheckId"=${scope.owner.rankCheckId} AND t."keywordId"=${scope.keywordId}
      AND b."projectId"=${scope.projectId} AND b."connectionId"=${scope.connectionId}
      AND b."definitionWorkflowId"=${scope.permit.workflowId} AND b."definitionWorkflowRunId"=${scope.permit.workflowRunId}
      AND b."queueDeadlineAt">clock_timestamp() AND b.state IN ('prepared','submitting') AND t.state IN ('prepared','submitting')
    FOR UPDATE OF b,t`;
  if (rows.length !== 1) throw new DefinitionUnavailableError();
  return rows[0].id;
}

export async function lockWorkerDefinitionScope(
  tx: DefinitionTransaction,
  scope: WorkerDefinitionScope,
) {
  // The project UPDATE lock serializes same-project sends/settings before any connection/run/Store lock.
  await lockDefinitionSource(tx, scope.projectId, scope.keywordId);
  await tx.$queryRaw`SELECT id FROM provider_connections WHERE id=${scope.connectionId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM rank_check_runs WHERE id=(SELECT "runId" FROM rank_checks WHERE id=${scope.owner.rankCheckId}) FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM rank_check_run_items WHERE "rankCheckId"=${scope.owner.rankCheckId} FOR UPDATE`;
  await tx.$queryRaw`SELECT id FROM rank_checks WHERE id=${scope.owner.rankCheckId} FOR UPDATE`;
  await tx.$queryRaw`SELECT "keywordId" FROM keyword_dispatch_states WHERE "keywordId"=${scope.keywordId} FOR SHARE`;
  if (scope.owner.queuedTaskId)
    await tx.$queryRaw`SELECT b.id FROM queued_rank_check_batches b JOIN queued_rank_check_tasks t ON t."batchId"=b.id WHERE t.id=${scope.owner.queuedTaskId} FOR UPDATE OF b,t`;
  await tx.$queryRaw`SELECT u.id FROM users u WHERE u.id IN (SELECT "ownerId" FROM projects WHERE id=${scope.projectId} UNION SELECT "requestedById" FROM rank_check_runs WHERE id=(SELECT "runId" FROM rank_checks WHERE id=${scope.owner.rankCheckId})) ORDER BY u.id FOR SHARE`;
  await tx.$queryRaw`SELECT m.id FROM memberships m WHERE m."projectId"=${scope.projectId} AND m."userId" IN (SELECT "requestedById" FROM rank_check_runs WHERE id=(SELECT "runId" FROM rank_checks WHERE id=${scope.owner.rankCheckId})) FOR SHARE`;
  await assertDefinitionRunCredential(tx, scope.projectId, {
    requestedById: scope.permit.principal.actorId,
    credentialId: scope.permit.principal.credentialId,
    credentialKind: scope.permit.principal.credentialKind,
  });
}

async function assertLegacyQueuedClaim(
  tx: DefinitionTransaction,
  keywordId: string,
  batchId: string,
  selection: { queuedDefinitionBatchId?: unknown; dispatchClaims?: unknown } | null,
) {
  if (selection?.queuedDefinitionBatchId !== batchId || !Array.isArray(selection.dispatchClaims))
    throw new DefinitionUnavailableError();
  const claims = selection.dispatchClaims.filter(
    (value) => value && typeof value === "object" && value.keywordId === keywordId,
  );
  const claim = claims[0] as { stateVersion?: unknown; advancedCheckAt?: unknown } | undefined;
  if (
    claims.length !== 1 ||
    typeof claim?.stateVersion !== "string" ||
    !/^\d+$/u.test(claim.stateVersion) ||
    typeof claim.advancedCheckAt !== "string" ||
    !Number.isFinite(Date.parse(claim.advancedCheckAt))
  )
    throw new DefinitionUnavailableError();
  const rows = await tx.$queryRaw<
    Array<{ id: string }>
  >`SELECT "keywordId" AS id FROM keyword_dispatch_states
    WHERE "keywordId"=${keywordId} AND "nextCheckAt"=${new Date(claim.advancedCheckAt)} AND xmin::text=${claim.stateVersion} FOR SHARE`;
  if (rows.length !== 1) throw new DefinitionUnavailableError();
}
