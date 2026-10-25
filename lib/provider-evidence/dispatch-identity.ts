import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { paidContext } from "@/lib/metering/paid-context";
import { recoveryInstance } from "@/lib/metering/recovery/tokens";
import { encryptSecret } from "@/lib/providers/crypto";
import type { Operation } from "@usagekit/core";
import type { ProviderRequest } from "@usagekit/providers";
import { dispatchPayload } from "./dispatch-payload";

// 186 days covers every six-calendar-month ID List metadata retention window (P-4).
export const DISPATCH_IDENTITY_RETENTION_MS = 186 * 86400000;
const digest = (body: string) => createHash("sha256").update(body).digest("hex");

/** Caller owns the intent transaction. No authority, fence, or financial row is changed here. */
export async function retainRankDispatchIdentity(
  tx: Prisma.TransactionClient,
  operation: Operation,
  request?: ProviderRequest,
  now = new Date(),
) {
  if (operation.provider !== "dataforseo") return;
  const retained = await paidContext(tx, {
    namespace: operation.scope.namespace,
    principal: operation.scope.principal,
    operationId: operation.operationId,
  });
  const context = retained.context;
  if ((context.feature ?? operation.operation) !== "rank_check") return;
  // Comparisons use rank_check pricing but own a different business target, outside rank recovery.
  if (!context.rankCheckId) return;
  if (!request || !context.keywordId)
    throw new Error("Original rank dispatch identity is unavailable");
  const { endpointPath, payload, executionMode } = dispatchPayload(request);
  if (executionMode === "live" && (typeof payload.tag !== "string" || !payload.tag.trim()))
    throw new Error("Live rank dispatch requires its native tag before intent and transport");
  const check = await tx.rankCheck.findUniqueOrThrow({
    where: { id: context.rankCheckId },
    select: { id: true, keywordId: true },
  });
  // The caller has locked and validated the keyword source in beforeReserve.
  const keyword = await tx.keyword.findUniqueOrThrow({
    where: { id: context.keywordId },
    select: { updatedAt: true },
  });
  const task = await (executionMode === "queued"
    ? tx.queuedRankCheckTask.findUniqueOrThrow({
        where: { id: context.correlationId },
        select: { id: true, rankCheckId: true },
      })
    : null);
  const storedOperation = await tx.meteringOperation.findUniqueOrThrow({
    where: {
      namespace_operation_id: {
        namespace: operation.scope.namespace,
        operation_id: operation.operationId,
      },
    },
    select: { operation_pk: true },
  });
  if (check.keywordId !== context.keywordId || (task && task.rankCheckId !== check.id))
    throw new Error("Original rank dispatch links disagree");
  const hosted = operation.fundingSource === "platform";
  if (hosted && !operation.creditAccountRef)
    throw new Error("Original dispatch payer account is unavailable");
  const body = JSON.stringify(payload);
  const identity = {
    operationPk: storedOperation.operation_pk,
    namespace: operation.scope.namespace,
    instanceId: recoveryInstance(),
    projectId: context.projectId,
    connectionId: context.connectionId,
    publicConnectionId: context.publicConnectionId,
    rankCheckId: context.rankCheckId,
    rankCheckRunId: context.rankCheckRunId ?? null,
    rankCheckRunItemId: context.rankCheckRunItemId ?? null,
    queuedTaskId: task?.id ?? null,
    keywordId: context.keywordId,
    keywordRevision: keyword.updatedAt,
    executionMode,
    payerKind: hosted ? "hosted" : "byok",
    principal: operation.scope.principal,
    costOwner: operation.costOwner,
    payerAccountRef: hosted ? (operation.creditAccountRef as string) : context.connectionId,
    providerCredentialVersion: context.providerCredentialVersion,
    provider: operation.provider,
    feature: context.feature ?? operation.operation,
    requestSource: operation.source,
    requestSurface: operation.surface,
    nativeTag: typeof payload.tag === "string" ? payload.tag : null,
    endpointPath,
    payloadSchemaVersion: 1,
    payloadHash: digest(body),
  };
  const identityHash = digest(JSON.stringify(identity));
  const previous = await tx.providerDispatchIdentity.findUnique({
    where: { operationPk: identity.operationPk },
    select: { identityHash: true },
  });
  if (previous) {
    if (previous.identityHash !== identityHash) throw new Error("Rank dispatch identity conflict");
    return;
  }
  if (retained.transportFenced || retained.dispatch_lease_id)
    throw new Error("Rank dispatch identity must precede intent and transport");
  await tx.providerDispatchIdentity.createMany({
    data: {
      ...identity,
      identityHash,
      payloadEncrypted: encryptSecret(body),
      createdAt: now,
      expiresAt: new Date(now.getTime() + DISPATCH_IDENTITY_RETENTION_MS),
    },
    skipDuplicates: true,
  });
  const original = await tx.providerDispatchIdentity.findUniqueOrThrow({
    where: { operationPk: identity.operationPk },
    select: { identityHash: true },
  });
  if (original.identityHash !== identityHash) throw new Error("Rank dispatch identity conflict");
}
