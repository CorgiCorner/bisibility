import "server-only";
import { prisma } from "@/lib/db/prisma";
import type { Prisma } from "@/lib/generated/prisma/client";
import { notifyOps } from "@/lib/ops/notify";
import type { Lease, Operation } from "@usagekit/core";
import type { Clock } from "@usagekit/store";
import {
  claimStoppedAssistantAttempt,
  deferAbandonedAssistantAttempts,
  deferStoppedAssistantAttempt,
  STOPPED_ATTEMPT_STATUS,
  settleStoppedAssistantAttempt,
  stoppedSettleBy,
} from "./accounting-deferred";
import type { AssistantAccountingBinding } from "./accounting-scope";
import type { lookupOpenRouterGeneration } from "./openrouter-generation";
import type { StopEvidence } from "./provider-types";
import { type StoppedCall, stoppedCallMicroUsd } from "./stop-estimate";
import { assistantTransaction } from "./transaction";

const HOLDER = "assistant:stopped-settlement";

export type StopSettlementOptions = {
  clock?: Clock;
  lookup?: typeof lookupOpenRouterGeneration;
  /**
   * The hosted OpenRouter key an attempt ran on (a stored key id or "env"), for Credits lookups;
   * null when it can no longer be used. Your-key stops keep their estimate.
   */
  hostedKey?: (keyId: string) => string | null | Promise<string | null>;
  transaction?: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  notify?: typeof notifyOps;
};

/**
 * Metering maintenance, every minute. A stopped attempt is settled by its own step at once; this
 * settles the ones that step could not (a failed write, or a process lost after the stop) and
 * attempts abandoned by a crashed process, which go pending at their reservation. Every pending
 * one settles here at its stored estimate under a recovery claim, so it cannot race the step's
 * own lease. One that still fails after its deadline goes unknown for the operator, so it cannot
 * block the queue. Then OpenRouter Credits stops get their provider-reported correction.
 */
export async function settleDueStoppedAssistantAttempts(options: StopSettlementOptions = {}) {
  const now = options.clock?.now() ?? new Date();
  const transaction = options.transaction ?? defaultTransaction;
  await transaction((tx) => deferAbandonedAssistantAttempts(tx, now));
  const pending = await transaction((tx) =>
    tx.assistantAttempt.findMany({
      where: { status: STOPPED_ATTEMPT_STATUS },
      orderBy: { updatedAt: "asc" },
      take: 50,
    }),
  );
  let settled = 0;
  let waiting = 0;
  const late: string[] = [];
  for (const attempt of pending) {
    const settleBy = stoppedSettleBy(attempt.usage);
    try {
      const done = await transaction(async (tx) => {
        const claim = await claimStoppedAssistantAttempt(
          tx,
          attempt.operationId,
          HOLDER,
          options.clock,
        );
        if (!claim) return false;
        await settleStoppedAssistantAttempt(tx, { ...claim, measured: null }, options.clock);
        return true;
      });
      if (done) settled++;
      else waiting++;
    } catch (error) {
      console.error("[assistant] stopped attempt settlement failed", {
        operationId: attempt.operationId,
        error,
      });
      if (settleBy && now >= settleBy) late.push(attempt.operationId);
    }
  }
  if (late.length) {
    await transaction((tx) =>
      tx.assistantAttempt.updateMany({
        where: { operationId: { in: late }, status: STOPPED_ATTEMPT_STATUS },
        data: { status: "unknown" },
      }),
    ).catch(() => console.error("[assistant] late stopped attempts stay pending"));
    await notifyOps({
      dedupeKey: `assistant_stop_settlement_late:${late[0]}`,
      kind: "assistant_stop_settlement_late",
      severity: "warning",
      title: "Stopped assistant answers failed to settle and are now unknown",
      fields: { Operations: late.slice(0, 10).join(", ") },
    }).catch(() => console.error("[assistant] late settlement alert failed"));
  }
  const { correctStoppedOpenRouterAttempts } = await import("./stop-correction");
  const corrections = await correctStoppedOpenRouterAttempts(options);
  // Zero-cost provider failures are watched on the same minute schedule; a failed watch never
  // blocks settlement.
  const { watchZeroCostProviderFailures } = await import("./provider-failure-watch");
  const watch = await watchZeroCostProviderFailures({
    clock: options.clock,
    transaction: options.transaction,
  }).catch(() => ({ alerted: [] as string[] }));
  return { settled, waiting, late: late.length, ...corrections, failureAlerts: watch.alerted };
}

export const defaultTransaction = <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
  prisma.$transaction(body, { timeout: 30000, maxWait: 10000 });

/**
 * A call this process cut (stop, disconnect, timeout, a provider failure after the request went
 * out) may have produced output, so it is never closed at zero: it is charged at once for the
 * estimate of what arrived, under the step's own lease, and the hold is released in the same
 * commit. An OpenRouter Credits call is marked for the provider-reported correction. A settlement
 * that fails leaves the attempt pending at its estimate, and the next sweep settles it.
 */
export async function chargeStoppedStep(
  binding: AssistantAccountingBinding,
  grant: { operation: Operation; lease: Lease },
  stop: { text: string; textTokens: number; promptTokens: number; evidence: StopEvidence | null },
) {
  const { evidence } = stop;
  const call: StoppedCall = {
    provider: binding.model.provider,
    promptBytes: binding.promptBytes,
    promptTokens: stop.promptTokens,
    textBytes: Buffer.byteLength(stop.text, "utf8"),
    textTokens: stop.textTokens,
    maxOutputTokens: binding.model.maxOutputTokens,
    reasoning: Boolean(binding.effort && binding.effort !== "none"),
    evidence: evidence ?? {
      generationId: null,
      promptUsage: null,
      reasoningBytes: 0,
      reasoningSeen: false,
    },
  };
  const correctable =
    binding.funding === "credits" &&
    call.provider === "openrouter" &&
    Boolean(call.evidence.generationId);
  await assistantTransaction(async (tx) => {
    const attempt = await tx.assistantAttempt.findUniqueOrThrow({
      where: { operationId: grant.operation.operationId },
      select: { reservedMicroUsd: true },
    });
    const reserved = BigInt(attempt.reservedMicroUsd.toString());
    const estimateMicro = stoppedCallMicroUsd(call, binding.model.pricing, reserved);
    const operationId = grant.operation.operationId;
    await deferStoppedAssistantAttempt(tx, {
      operationId,
      call,
      estimateMicro,
      now: new Date(),
      correctable,
    });
  });
  const authority = { kind: "lease" as const, leaseId: grant.lease.leaseId };
  await assistantTransaction((tx) =>
    settleStoppedAssistantAttempt(tx, { operation: grant.operation, authority, measured: null }),
  ).catch(async () => {
    console.error("[assistant] stopped attempt left pending for the sweep");
    await assistantTransaction((tx) =>
      tx.assistantRun.update({ where: { id: binding.runId }, data: { costCertainty: "unknown" } }),
    ).catch(() => {});
  });
}
