import "server-only";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { NativeRequestGuard, PaidFenceHook } from "@/lib/metering/paid-attempt-types";
import { ownCredentialVersion } from "@/lib/provider-usage/credential-version";
import { locationForProvider } from "@/lib/rank-check/fallback-location";
import type { RankCheckConnectionInput, RunCheckInput } from "@/lib/rank-check/runner";
import type { SerpDepth } from "@/lib/serp/constants";
import { serpRankLocation } from "@/lib/serp/location";
import { assertDefinitionActor } from "./access";
import { frozenConfiguredScope, sameDefinitionBytes } from "./canonical";
import { DefinitionConflictError, DefinitionUnavailableError } from "./errors";
import type { DefinitionBinding, DefinitionTransaction } from "./model";
import { assertDefinitionAtDispatch, captureDefinitionBeforeIo } from "./producer";
import { readDefinitionSource } from "./storage";
import {
  definitionWorkerHost,
  lockWorkerDefinitionScope,
  type WorkerDefinitionScope,
} from "./worker-authority";
import { assertDefinitionExecutionPermit, type DefinitionExecutionPermit } from "./worker-claim";
import { workerDefinitionPorts } from "./worker-composition";
import { assertDefinitionItemIntent, readAdmittedDefinitionIntent } from "./worker-intent";
import { retainNativeDefinitionRequest } from "./worker-request-proof";

export type WorkerDefinitionSession = Readonly<{
  binding: DefinitionBinding;
  beforeFence: PaidFenceHook;
  beforeReserve: NativeRequestGuard;
}>;
export function workerDefinitionOwner(
  permit: DefinitionExecutionPermit,
  providerId: string,
  connectionId: string,
  queuedTaskId: string | null,
) {
  assertDefinitionExecutionPermit(permit);
  const executionKey = queuedTaskId
    ? `queued-definition:${queuedTaskId}`
    : `definition:${permit.rankCheckId}:${providerId}:${connectionId}`;
  if (executionKey.length > 256) throw new DefinitionUnavailableError();
  return { rankCheckId: permit.rankCheckId, executionKey, queuedTaskId };
}
export async function captureWorkerDefinition(
  tx: DefinitionTransaction,
  input: {
    permit: DefinitionExecutionPermit;
    projectId: string;
    keywordId: string;
    connection: RankCheckConnectionInput;
    depth?: SerpDepth;
    queuedTaskId?: string;
  },
): Promise<WorkerDefinitionSession> {
  const { connection, permit } = input;
  if (!connection.id || !["own", "hosted"].includes(connection.credentialSource ?? ""))
    throw new DefinitionUnavailableError();
  const scope: WorkerDefinitionScope = {
    permit,
    projectId: input.projectId,
    keywordId: input.keywordId,
    providerId: connection.provider,
    connectionId: connection.id,
    credentialSource: connection.credentialSource as "own" | "hosted",
    credentialVersion:
      connection.credentialSource === "own"
        ? ownCredentialVersion(connection.provider, connection.id, connection.credentialsEncrypted)
        : null,
    owner: workerDefinitionOwner(
      permit,
      connection.provider,
      connection.id,
      input.queuedTaskId ?? null,
    ),
  };
  const { host, withinNativeFence } = definitionWorkerHost(scope, workerDefinitionPorts);
  await lockWorkerDefinitionScope(tx, scope);
  const intent = await readAdmittedDefinitionIntent(
    tx,
    permit.principal.runItemId,
    input.projectId,
    input.keywordId,
  );
  if (
    !sameDefinitionBytes(
      await readDefinitionSource(tx, input.projectId, input.keywordId),
      intent.source,
    )
  )
    throw new DefinitionConflictError();
  const binding = await captureDefinitionBeforeIo(
    tx,
    {
      projectId: input.projectId,
      keywordId: input.keywordId,
      providerId: connection.provider,
      requestedDepth: intent.depth,
      owner: scope.owner,
    },
    host,
  );
  await assertDefinitionItemIntent(tx, permit.principal.runItemId, binding);
  if (
    !sameDefinitionBytes(
      await readDefinitionSource(tx, binding.projectId, binding.keywordId),
      binding.source,
    )
  )
    throw new DefinitionConflictError();
  return {
    binding,
    beforeReserve: {
      lockBusiness: (reserveTx) => lockWorkerDefinitionScope(reserveTx, scope),
      async assertRequest(reserveTx, operationId, request) {
        const execution = await host.assertOwnExecution(
          reserveTx,
          binding.owner,
          {
            projectId: binding.projectId,
            keywordId: binding.keywordId,
            providerId: binding.request.providerId,
          },
          "capture",
        );
        if (execution.kind === "user")
          await assertDefinitionActor(reserveTx, execution.actorId, binding.projectId, "update");
        if (
          !sameDefinitionBytes(
            await readDefinitionSource(reserveTx, binding.projectId, binding.keywordId),
            binding.source,
          )
        )
          throw new DefinitionConflictError();
        await host.assertImplementedAdapter(
          reserveTx,
          binding.source,
          binding.request.providerId,
          binding.request,
        );
        await retainNativeDefinitionRequest(reserveTx, binding, operationId, request);
      },
    },
    beforeFence: withinNativeFence(async (fenceTx) => {
      await assertDefinitionAtDispatch(fenceTx, binding, host);
    }),
  };
}
export async function liveWorkerDefinition(
  db: Pick<PrismaClient, "$transaction">,
  input: RunCheckInput,
  providerId: string,
) {
  // Synthetic local providers have no paid native owner. They cannot mint a paid binding here.
  if (!["dataforseo", "serpapi"].includes(providerId)) return null;
  if (
    !input.definitionPermit ||
    !input.projectId ||
    !input.rankCheckId ||
    input.definitionPermit.rankCheckId !== input.rankCheckId
  )
    throw new DefinitionUnavailableError();
  return db.$transaction((tx) =>
    captureWorkerDefinition(tx, {
      permit: input.definitionPermit!,
      projectId: input.projectId!,
      keywordId: input.keyword.id,
      connection: input.connection,
      depth: input.depth,
    }),
  );
}
/** Every body/price/normalizer uses this captured request. Provider-reported effective scope stays separate. */
export function frozenRunnerInput(
  input: RunCheckInput,
  session: WorkerDefinitionSession,
): RunCheckInput {
  const request = session.binding.request;
  return {
    ...input,
    depth: request.depth,
    stopOnMatch: request.stopOnMatch,
    keyword: {
      ...input.keyword,
      text: request.keyword,
      device: request.device,
      domain: request.domain,
      location: locationForProvider(
        request.providerId,
        serpRankLocation(request.location),
        request.location.kind === "city",
      ),
    },
  };
}
export function configuredWorkerObservation<T extends { configuredScope: unknown }>(
  observation: T | null | undefined,
  session: WorkerDefinitionSession | null,
): T | null {
  if (!observation) return null;
  return session
    ? { ...observation, configuredScope: frozenConfiguredScope(session.binding.source.target) }
    : observation;
}
