import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter } from "@/lib/metering/transaction-meter";
import type { Operation } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import { ASSISTANT_METERING_NAMESPACE } from "./accounting-scope";
import { ASSISTANT_ABANDONED_ATTEMPT_MS, ASSISTANT_STOP_CORRECTION_MINUTES } from "./limits";
import type { AssistantUsage } from "./pricing";
import { object } from "./provider-types";
import { parseStoppedCall, type StoppedCall, stoppedUsage } from "./stop-estimate";

/** A stopped attempt waiting for its delayed charge. Its wallet hold stays open until then. */
export const STOPPED_ATTEMPT_STATUS = "pending_settlement";
/** Statuses whose cost is not settled yet: views and operators treat them as open. */
export const OPEN_ATTEMPT_STATUSES = ["dispatched", "unknown", STOPPED_ATTEMPT_STATUS];

const NO_USAGE: AssistantUsage = {
  inputTokens: 0,
  cachedInputTokens: 0,
  cacheWriteTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
};

/**
 * A stopped OpenRouter Credits answer settles at its estimate at once; the sweep then looks the
 * generation up and, until `until`, may replace the estimate with the provider-reported cost.
 * state: due (still looking), applied (corrected), kept (the estimate stands).
 */
export type StopCorrection = {
  generationId: string;
  state: "due" | "applied" | "kept";
  until: string;
};

/** The stored correction of a settled stopped attempt, or null when it has none. */
export function stopCorrectionOf(usage: unknown): StopCorrection | null {
  const value = object(object(usage).correction);
  if (typeof value.generationId !== "string" || typeof value.until !== "string") return null;
  if (!["due", "applied", "kept"].includes(String(value.state))) return null;
  return value as unknown as StopCorrection;
}

export type SettlementAuthority = { kind: "lease" | "recovery"; leaseId: string };
export type MeasuredStop = { usage: AssistantUsage; micro: bigint; requestId: string | null };

/**
 * A dispatched call cut before its receipt (stop, disconnect, timeout, a provider failure after
 * the request went out) is never closed at zero: it goes pending with the estimate of what it
 * streamed, which its step settles at once (the sweep retries if that settlement fails).
 */
export async function deferStoppedAssistantAttempt(
  tx: Prisma.TransactionClient,
  input: {
    operationId: string;
    call: StoppedCall;
    estimateMicro: bigint;
    now: Date;
    /** An OpenRouter Credits call whose provider-reported cost may replace the estimate later. */
    correctable?: boolean;
  },
) {
  // Due at once: the step settles it right away, and the sweep only if that settlement failed.
  const settleBy = input.now;
  const generationId = input.call.evidence.generationId;
  const correction: StopCorrection | null =
    input.correctable && generationId
      ? {
          generationId,
          state: "due",
          until: new Date(
            input.now.getTime() + ASSISTANT_STOP_CORRECTION_MINUTES * 60000,
          ).toISOString(),
        }
      : null;
  const updated = await tx.assistantAttempt.updateMany({
    where: { operationId: input.operationId, status: "dispatched" },
    data: {
      status: STOPPED_ATTEMPT_STATUS,
      usage: {
        outcome: "aborted",
        stopped: input.call as unknown as Prisma.InputJsonObject,
        estimateMicroUsd: input.estimateMicro.toString(),
        settleBy: settleBy.toISOString(),
        ...(correction ? { correction } : {}),
      },
    },
  });
  if (updated.count !== 1) throw new Error("Assistant attempt is not dispatched");
  return settleBy;
}

/**
 * A dispatched attempt still open long after every step deadline and lease has lapsed lost the
 * process that sent it (a crash or a deploy). Nothing is known about its output, so it goes
 * pending at its reservation, due at once, and the sweep charges it under a recovery claim.
 */
export async function deferAbandonedAssistantAttempts(tx: Prisma.TransactionClient, now: Date) {
  const cutoff = new Date(now.getTime() - ASSISTANT_ABANDONED_ATTEMPT_MS);
  return tx.$executeRaw`UPDATE assistant_attempts SET status=${STOPPED_ATTEMPT_STATUS},
    usage=jsonb_build_object('outcome','abandoned','estimateMicroUsd',"reservedMicroUsd"::text,
      'settleBy',${now.toISOString()}::text), "updatedAt"=${now}
    WHERE status='dispatched' AND COALESCE("dispatchedAt","createdAt") < ${cutoff}`;
}

/**
 * An unknown attempt an operator reconciles is charged like a stop with no evidence: at the
 * estimate stored before it went unknown, else its reservation, never released at zero.
 */
export async function deferUnresolvedAssistantAttempt(
  tx: Prisma.TransactionClient,
  operationId: string,
  now: Date,
) {
  const attempt = await tx.assistantAttempt.findUnique({ where: { operationId } });
  if (!attempt || !["unknown", "dispatched"].includes(attempt.status))
    throw new Error("Unknown assistant attempt not found");
  const stored = object(attempt.usage);
  const estimate =
    typeof stored.estimateMicroUsd === "string" && /^\d+$/.test(stored.estimateMicroUsd)
      ? stored.estimateMicroUsd
      : attempt.reservedMicroUsd.toString();
  const usage = { ...stored, outcome: "unresolved", estimateMicroUsd: estimate };
  const updated = await tx.assistantAttempt.updateMany({
    where: { operationId, status: attempt.status },
    data: {
      status: STOPPED_ATTEMPT_STATUS,
      usage: { ...usage, settleBy: now.toISOString() } as Prisma.InputJsonObject,
    },
  });
  if (updated.count !== 1) throw new Error("Assistant attempt changed during reconciliation");
}

/** When the stored stop must be settled at the latest, or null for no stop evidence. */
export function stoppedSettleBy(usage: unknown): Date | null {
  const value = object(usage).settleBy;
  const at = typeof value === "string" ? new Date(value) : null;
  return at && Number.isFinite(at.getTime()) ? at : null;
}

/**
 * Settles a pending stopped attempt exactly once, under the caller's lease or recovery claim:
 * with measured usage when the provider reported it, otherwise with the estimate stored at the
 * stop, which never exceeds the reservation. Absent or unreadable stop evidence (an abandoned or
 * operator-closed attempt) settles at the stored estimate, else the reservation, with no tokens. Credits debit the wallet in full (it may go below
 * zero); your key records the amount as spend. A second settlement finds the attempt settled.
 */
export async function settleStoppedAssistantAttempt(
  tx: Prisma.TransactionClient,
  input: {
    operation: Operation;
    authority: SettlementAuthority;
    measured: MeasuredStop | null;
    /** An operator's reason replaces the default evidence reference. */
    evidenceRef?: string;
  },
  clock?: Clock,
) {
  const { operation, measured } = input;
  const operationId = operation.operationId;
  await lockStoppedAttempt(tx, operationId);
  const attempt = await tx.assistantAttempt.findUnique({ where: { operationId } });
  if (attempt?.status !== STOPPED_ATTEMPT_STATUS)
    throw new Error("Assistant attempt is not pending settlement");
  const stored = object(attempt.usage);
  const call = parseStoppedCall(stored);
  const estimate =
    typeof stored.estimateMicroUsd === "string" && /^\d+$/.test(stored.estimateMicroUsd)
      ? BigInt(stored.estimateMicroUsd)
      : null;
  const reserved = BigInt(attempt.reservedMicroUsd.toString());
  const bound = estimate === null || estimate > reserved ? reserved : estimate;
  const micro = measured ? measured.micro : bound;
  const usage = measured?.usage ?? (call ? stoppedUsage(call) : NO_USAGE);
  const certainty = measured ? ("measured" as const) : ("estimated" as const);
  const evidenceRef =
    input.evidenceRef ?? `stopped answer, ${measured ? "provider-reported" : "estimated"} usage`;
  const requestId = measured?.requestId ?? null;
  let settledOperation: Operation;
  if (attempt.creditHoldId) {
    if (!operation.creditAccountRef) throw new Error("Assistant credit hold is incomplete");
    const { chargeDeferredAssistantCreditAttempt } = await import("./funding-extension");
    const charged = await chargeDeferredAssistantCreditAttempt(
      tx,
      {
        operation,
        authority: input.authority,
        holdId: attempt.creditHoldId,
        walletId: operation.creditAccountRef,
        providerMicro: micro,
        certainty,
        providerRequestId: requestId,
        evidenceRef,
      },
      clock,
    );
    settledOperation = charged.result.operation;
  } else {
    const stamp = (clock?.now() ?? new Date()).toISOString();
    const quantity = (unit: "usd_micro" | "requests", value: bigint) => ({
      unit,
      certainty,
      quantity: { unit, value, scale: 0 },
    });
    const result = await (await createTransactionMeter(tx, clock)).settle({
      namespace: operation.scope.namespace,
      principal: operation.scope.principal,
      operationId,
      commandId: "assistant:stopped",
      expectedVersion: operation.version,
      authority: input.authority,
      receipt: {
        id: `assistant:stopped:${operationId}`,
        source: "dispatch",
        evidenceRef,
        cost: { certainty, money: { units: micro, currency: "USD" } },
        measurements: [quantity("usd_micro", micro), quantity("requests", 1n)],
        ...(requestId ? { providerRequestId: requestId } : {}),
        occurredAt: stamp,
        recordedAt: stamp,
        cached: false,
        failed: true,
      },
    });
    if (result.outcome !== "settled")
      throw new Error(`Assistant stopped settlement refused: ${result.outcome}`);
    settledOperation = result.operation;
  }
  const updated = await tx.assistantAttempt.updateMany({
    where: { operationId, status: STOPPED_ATTEMPT_STATUS },
    data: {
      status: "settled",
      settledMicroUsd: micro.toString(),
      providerRequestId: requestId,
      usage: { ...stored, settled: { certainty, ...usage } } as Prisma.InputJsonObject,
    },
  });
  if (updated.count !== 1) throw new Error("Assistant attempt changed during settlement");
  await tx.$queryRaw`SELECT id FROM assistant_runs WHERE id=${attempt.runId} FOR UPDATE`;
  const run = await tx.assistantRun.findUniqueOrThrow({
    where: { id: attempt.runId },
    select: { costMicroUsd: true },
  });
  const unresolved = await tx.assistantAttempt.count({
    where: { runId: attempt.runId, status: { in: OPEN_ATTEMPT_STATUSES } },
  });
  const anthropic = call?.provider === "anthropic";
  await tx.assistantRun.update({
    where: { id: attempt.runId },
    data: {
      inputTokens: {
        increment:
          usage.inputTokens + (anthropic ? usage.cachedInputTokens + usage.cacheWriteTokens : 0),
      },
      outputTokens: { increment: usage.outputTokens },
      costMicroUsd: (BigInt(run.costMicroUsd?.toString() ?? "0") + micro).toString(),
      costCertainty: unresolved ? "unknown" : certainty,
    },
  });
  return { micro, certainty, operation: settledOperation };
}

/** The sweeper's authority: a recovery claim once the stopping step's own lease has lapsed. */
export async function claimStoppedAssistantAttempt(
  tx: Prisma.TransactionClient,
  operationId: string,
  holder: string,
  clock?: Clock,
): Promise<{ operation: Operation; authority: SettlementAuthority } | null> {
  await lockStoppedAttempt(tx, operationId);
  const attempt = await tx.assistantAttempt.findUnique({
    where: { operationId },
    include: { run: { select: { projectId: true } } },
  });
  if (attempt?.status !== STOPPED_ATTEMPT_STATUS) return null;
  const project = await tx.project.findUnique({
    where: { id: attempt.run.projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Assistant stopped attempt has no project");
  const meter = await createTransactionMeter(tx, clock);
  const claim = await meter.claimForRecovery({
    namespace: ASSISTANT_METERING_NAMESPACE,
    principal: project.ownerId,
    operationId,
    holder,
    leaseTtlMs: 60000,
  });
  if (!("claimed" in claim) || !claim.claimed) return null;
  if (
    claim.operation.correlationId !== attempt.runId ||
    claim.operation.scope.group !== attempt.run.projectId
  )
    throw new Error("Assistant recovery binding mismatch");
  return {
    operation: claim.operation,
    authority: { kind: "recovery", leaseId: claim.lease.leaseId },
  };
}

/**
 * Every settlement path (the step's lease, the sweeper, an operator) locks the attempt row first,
 * before the Meter operation or the wallet, so they queue in one order instead of deadlocking.
 */
async function lockStoppedAttempt(tx: Prisma.TransactionClient, operationId: string) {
  await tx.$queryRaw`SELECT id FROM assistant_attempts WHERE "operationId"=${operationId} FOR UPDATE`;
}
