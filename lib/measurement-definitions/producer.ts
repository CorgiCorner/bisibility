import "server-only";
import { randomUUID } from "node:crypto";
import { ProjectReadOnlyError } from "@/lib/deployment/project-write-mode";
import { isScheduledFrequency } from "@/lib/rank-check/schedule-frequency";
import { hasAsciiControlCharacters } from "@/lib/validation/control-characters";
import { assertDefinitionActor } from "./access";
import {
  currentHeadMatches,
  definitionFingerprint,
  frozenRequest,
  sameDefinitionBytes,
  targetHeadMatches,
} from "./canonical";
import { DefinitionConflictError, DefinitionUnavailableError } from "./errors";
import type {
  CaptureDefinitionInput,
  DefinitionBinding,
  DefinitionProducerPorts,
  DefinitionSource,
  DefinitionTransaction,
  VerifiedDefinitionExecution,
} from "./model";
import {
  definitionAuthorityInstalled,
  lockDefinitionSource,
  readDefinitionBinding,
  readDefinitionHead,
  readDefinitionSource,
} from "./storage";

function validRef(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= 256 &&
    !(/\s/u.test(value) || hasAsciiControlCharacters(value))
  );
}
async function assertExecutionPrincipal(
  tx: DefinitionTransaction,
  execution: VerifiedDefinitionExecution,
  projectId: string,
) {
  if (execution?.kind === "user" && validRef(execution.actorId)) {
    await assertDefinitionActor(tx, execution.actorId, projectId, "update");
    return;
  }
  if (
    execution?.kind === "project_credential" &&
    execution.actorId === null &&
    execution.projectId === projectId &&
    execution.credentialKind === "project_key" &&
    validRef(execution.credentialId) &&
    validRef(execution.runId) &&
    validRef(execution.runItemId)
  ) {
    await tx.$queryRaw`SELECT id FROM api_keys WHERE id=${execution.credentialId} FOR SHARE`;
    const key = await tx.apiKey.findFirst({
      where: { id: execution.credentialId, projectId },
      select: { revokedAt: true, expiresAt: true, scopes: true },
    });
    if (
      !key ||
      key.revokedAt ||
      (key.expiresAt && key.expiresAt <= new Date()) ||
      !key.scopes.some((scope) => scope === "write" || scope === "admin")
    )
      throw new DefinitionUnavailableError();
    return;
  }
  if (
    execution?.kind === "scheduler" &&
    execution.actorId === null &&
    validRef(execution.runId) &&
    validRef(execution.runItemId) &&
    ((execution.scheduleId === null && execution.scheduleEpoch === null) ||
      (validRef(execution.scheduleId) &&
        typeof execution.scheduleEpoch === "string" &&
        execution.scheduleEpoch.length <= 19 &&
        /^(?:0|[1-9]\d*)$/u.test(execution.scheduleEpoch) &&
        BigInt(execution.scheduleEpoch) <= 9_223_372_036_854_775_807n))
  )
    return;
  throw new DefinitionUnavailableError();
}
function assertExecutionIntent(execution: VerifiedDefinitionExecution, source: DefinitionSource) {
  if (execution.kind !== "scheduler") return;
  const assigned = source.policy.checkSchedule;
  const intent = assigned ?? source.policy.keywordSchedule ?? source.policy.defaults;
  if (
    !intent ||
    !isScheduledFrequency(intent.frequency) ||
    (assigned && (!assigned.enabled || assigned.archivedAt)) ||
    execution.scheduleId !== (assigned?.id ?? null) ||
    execution.scheduleEpoch !== source.epochs.checkSchedule
  )
    throw new DefinitionConflictError();
}

/** Caller composes into the durable run/task transaction. This function does not prepare admission or send. */
export async function captureDefinitionBeforeIo(
  tx: DefinitionTransaction,
  original: CaptureDefinitionInput,
  host: DefinitionProducerPorts,
): Promise<DefinitionBinding> {
  const input: CaptureDefinitionInput = {
    projectId: original.projectId,
    keywordId: original.keywordId,
    providerId: original.providerId,
    requestedDepth: original.requestedDepth,
    owner: {
      rankCheckId: original.owner.rankCheckId,
      executionKey: original.owner.executionKey,
      queuedTaskId: original.owner.queuedTaskId,
    },
  };
  if (!input.owner.executionKey || input.owner.executionKey.length > 256)
    throw new DefinitionUnavailableError();
  if (!(await definitionAuthorityInstalled(tx))) throw new DefinitionUnavailableError();
  // Only this minimized descriptor and literal stage reach the server port; JSON kind/actor/role is ignored.
  const execution = await host.assertOwnExecution(
    tx,
    input.owner,
    { projectId: input.projectId, keywordId: input.keywordId, providerId: input.providerId },
    "capture",
  );
  await assertExecutionPrincipal(tx, execution, input.projectId);
  await lockDefinitionSource(tx, input.projectId, input.keywordId);
  const project = await tx.project.findUnique({
    where: { id: input.projectId },
    select: { writeMode: true, isSample: true },
  });
  if (!project || project.writeMode !== "active" || project.isSample)
    throw new ProjectReadOnlyError(input.projectId);
  const retained = await readDefinitionBinding(
    tx,
    input.projectId,
    input.keywordId,
    input.owner.executionKey,
    input.owner.rankCheckId,
  );
  if (retained) {
    if (
      !sameDefinitionBytes(retained.owner, input.owner) ||
      !sameDefinitionBytes(
        retained.request,
        frozenRequest(retained.source, input.providerId, input.requestedDepth),
      )
    )
      throw new DefinitionConflictError();
    return retained;
  }
  const source = await readDefinitionSource(tx, input.projectId, input.keywordId);
  assertExecutionIntent(execution, source);
  const request = frozenRequest(source, input.providerId, input.requestedDepth);
  await host.assertImplementedAdapter(tx, source, input.providerId, request);
  const head = await readDefinitionHead(tx, input.projectId, input.keywordId);
  const sameHead = head !== null && currentHeadMatches(head, source);
  const targetRevision =
    head && targetHeadMatches(head, source) ? head.targetRevision : randomUUID();
  const policyRevision = sameHead ? head.policyRevision : randomUUID();
  if (!head || targetRevision !== head.targetRevision) {
    await tx.$executeRaw`INSERT INTO measurement_target_revisions (id,"projectId","keywordId",source,epochs) VALUES (${targetRevision},${input.projectId},${input.keywordId},${JSON.stringify(source.target)}::jsonb,${JSON.stringify(source.epochs)}::jsonb)`;
  }
  if (!sameHead) {
    await tx.$executeRaw`INSERT INTO measurement_policy_revisions (id,"projectId","keywordId","targetRevisionId",source,epochs) VALUES (${policyRevision},${input.projectId},${input.keywordId},${targetRevision},${JSON.stringify(source.policy)}::jsonb,${JSON.stringify(source.epochs)}::jsonb)`;
    await tx.$executeRaw`INSERT INTO measurement_definition_heads ("projectId","keywordId","targetRevisionId","policyRevisionId",generation,epochs,"sourceFingerprint") VALUES (${input.projectId},${input.keywordId},${targetRevision},${policyRevision},1,${JSON.stringify(source.epochs)}::jsonb,${definitionFingerprint(source)})
      ON CONFLICT ("projectId","keywordId") DO UPDATE SET "targetRevisionId"=EXCLUDED."targetRevisionId","policyRevisionId"=EXCLUDED."policyRevisionId",generation=measurement_definition_heads.generation+1,epochs=EXCLUDED.epochs,"sourceFingerprint"=EXCLUDED."sourceFingerprint","capturedAt"=clock_timestamp()`;
  }
  const id = randomUUID();
  await tx.$executeRaw`INSERT INTO measurement_execution_bindings (id,"projectId","keywordId","rankCheckId","executionKey","queuedTaskId","targetRevisionId","policyRevisionId",owner,request,source) VALUES (${id},${input.projectId},${input.keywordId},${input.owner.rankCheckId},${input.owner.executionKey},${input.owner.queuedTaskId},${targetRevision},${policyRevision},${JSON.stringify(input.owner)}::jsonb,${JSON.stringify(request)}::jsonb,${JSON.stringify(source)}::jsonb)`;
  await host.recordMutation(tx, {
    actorId: execution.actorId,
    projectId: input.projectId,
    keywordId: input.keywordId,
    operation: "capture",
    revisionId: id,
    previousRevisionId: head?.policyRevision ?? null,
  });
  const binding = await readDefinitionBinding(
    tx,
    input.projectId,
    input.keywordId,
    input.owner.executionKey,
    input.owner.rankCheckId,
  );
  if (!binding) throw new DefinitionUnavailableError();
  return binding;
}
/** Run immediately inside the existing durable dispatch fence; never recapture a stale prepared request. */
export async function assertDefinitionAtDispatch(
  tx: DefinitionTransaction,
  original: DefinitionBinding,
  host: DefinitionProducerPorts,
) {
  const binding = structuredClone(original);
  if (!(await definitionAuthorityInstalled(tx))) throw new DefinitionUnavailableError();
  const execution = await host.assertOwnExecution(
    tx,
    binding.owner,
    {
      projectId: binding.projectId,
      keywordId: binding.keywordId,
      providerId: binding.request.providerId,
    },
    "dispatch",
  );
  await assertExecutionPrincipal(tx, execution, binding.projectId);
  await lockDefinitionSource(tx, binding.projectId, binding.keywordId);
  const project = await tx.project.findUnique({
    where: { id: binding.projectId },
    select: { writeMode: true, isSample: true },
  });
  if (!project || project.writeMode !== "active" || project.isSample)
    throw new ProjectReadOnlyError(binding.projectId);
  const retained = await readDefinitionBinding(
    tx,
    binding.projectId,
    binding.keywordId,
    binding.owner.executionKey,
    binding.owner.rankCheckId,
  );
  if (!retained || !sameDefinitionBytes(retained, binding)) throw new DefinitionConflictError();
  const source = await readDefinitionSource(tx, binding.projectId, binding.keywordId);
  if (!sameDefinitionBytes(source, binding.source)) throw new DefinitionConflictError();
  assertExecutionIntent(execution, source);
  await host.assertImplementedAdapter(tx, source, binding.request.providerId, binding.request);
  return retained.request;
}
/** Collection uses the original binding after the host's *current own admission* retrieval guard. */
type RetainedOwnerInput = Pick<CaptureDefinitionInput, "projectId" | "keywordId" | "owner">;
export async function readRetainedDefinition(
  tx: DefinitionTransaction,
  input: RetainedOwnerInput,
  assertOwnRetrieval: (tx: DefinitionTransaction, owner: RetainedOwnerInput) => Promise<void>,
) {
  await assertOwnRetrieval(tx, input);
  const binding = await readDefinitionBinding(
    tx,
    input.projectId,
    input.keywordId,
    input.owner.executionKey,
    input.owner.rankCheckId,
  );
  if (!binding || !sameDefinitionBytes(binding.owner, input.owner))
    throw new DefinitionUnavailableError();
  return binding;
}
