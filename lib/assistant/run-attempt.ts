import "server-only";
import { decryptSecret } from "@/lib/providers/crypto";
import { admitAssistantAttempt } from "./accounting-admission";
import { AssistantBindingError } from "./accounting-binding";
import {
  markAssistantAttemptUnknown,
  releaseAssistantAttempt,
  settleAssistantAttempt,
} from "./accounting-operation";
import { closeReceiptlessAssistantAttempt, type ReceiptlessOutcome } from "./accounting-recovery";
import type { AssistantAccountingBinding } from "./accounting-scope";
import {
  recordHostedAssistantKeyOutcome,
  releaseAssistantCreditAttempt,
  settleAssistantCreditAttempt,
} from "./funding-extension";
import type { KeyRejection } from "./key-rejection";
import { type AssistantUsage, priceAssistantUsage } from "./pricing";
import { streamAssistantProvider } from "./provider";
import type { PromptItem } from "./provider-prompt";
import type { AssistantPromptBody, StopEvidence } from "./provider-types";
import {
  alertSweptAttempt,
  alertUnknownAttempt,
  dispatchAssistantTransport,
  grantOf,
} from "./run-dispatch";
import { estimateTextTokens } from "./stop-estimate";
import { chargeStoppedStep } from "./stop-settlement";
import { assistantTransaction } from "./transaction";
import type { AssistantErrorCode } from "./wire";

type Call = { id: string; name: string; argumentsJson: string };
type Reasoning = Extract<PromptItem, { type: "reasoning" }>;
/** A platform key the provider refused before running anything; the step may try the next key. */
export type KeyRefusal = { keyId: string; rejection: KeyRejection };
export const refused = (error: AssistantErrorCode) => ({
  text: "",
  calls: [] as Call[],
  reasoning: [] as Reasoning[],
  error,
  usage: null,
  cost: null,
  unknown: false,
});

export type AssistantAttemptResult = {
  text: string;
  calls: Call[];
  reasoning: Reasoning[];
  error: AssistantErrorCode | null;
  usage: AssistantUsage | null;
  cost: bigint | null;
  unknown: boolean;
  keyRefusal?: KeyRefusal;
};

export type AssistantStepInput = {
  binding: AssistantAccountingBinding;
  step: number;
  body: AssistantPromptBody;
  signal: AbortSignal;
  timeoutMs: number;
  onText: (delta: string) => void;
};

/**
 * One attempt of one step: admission, dispatch on one key, the provider call and its settlement.
 * `exclude` lists the platform keys that already refused this step. keyRefusal is set only when a
 * platform key was refused before the provider ran anything and the attempt closed at zero.
 */
export async function runAssistantAttempt(
  input: AssistantStepInput & { exclude: readonly string[] },
): Promise<AssistantAttemptResult> {
  const { binding, signal } = input;
  let reservation: Awaited<ReturnType<typeof admitAssistantAttempt>>;
  try {
    reservation = await assistantTransaction((tx) =>
      admitAssistantAttempt(tx, binding, input.step),
    );
  } catch (error) {
    if (error instanceof AssistantBindingError) return refused(error.code);
    throw error;
  }
  if (reservation.outcome !== "reserved") {
    const scope =
      reservation.outcome === "exceeded" ? reservation.exceeded.budget.scope.kind : null;
    return refused(
      scope === "platform_pool"
        ? "pool_exhausted"
        : reservation.outcome === "exceeded"
          ? "limit_exceeded"
          : "accounting_unavailable",
    );
  }
  if (reservation.replayed) return refused("accounting_unavailable");
  if (signal.aborted) {
    await assistantTransaction(async (tx) => {
      if (binding.funding === "credits") {
        await releaseAssistantCreditAttempt(tx, reservation.operation, "cancelled before dispatch");
        return;
      }
      await releaseAssistantAttempt(tx, reservation.operation, "cancelled before dispatch");
    });
    return refused("cancelled");
  }
  let dispatched: Awaited<ReturnType<typeof dispatchAssistantTransport>>;
  try {
    dispatched = await dispatchAssistantTransport(binding, reservation.operation, input.exclude);
  } catch (error) {
    await assistantTransaction(async (tx) => {
      if (binding.funding === "credits") {
        await releaseAssistantCreditAttempt(tx, reservation.operation, "dispatch refused");
        return;
      }
      await releaseAssistantAttempt(tx, reservation.operation, "dispatch refused");
    });
    throw error;
  }
  /* Transport authority has committed before the provider can be contacted. */

  let text = "",
    usage: AssistantUsage | null = null,
    requestId: string | null = null,
    providerReportedCostUsd: number | null = null,
    error: AssistantErrorCode | null = null,
    receiptless: ReceiptlessOutcome | null = null,
    providerFailure = false,
    keyRejection: KeyRejection | null = null,
    stopEvidence: StopEvidence | null = null,
    textTokens = 0,
    streaming = false;
  const calls: Call[] = [];
  const reasoning: Reasoning[] = [];
  try {
    const apiKey = dispatched.secret ? decryptSecret(dispatched.secret) : dispatched.hosted?.apiKey;
    if (!apiKey) throw new Error("Credential unavailable");
    streaming = true;
    for await (const event of streamAssistantProvider({
      provider: binding.model.provider,
      model: binding.model.providerModel,
      apiKey,
      funding: binding.funding,
      body: input.body,
      effort: binding.effort ?? null,
      signal,
      timeoutMs: input.timeoutMs,
    })) {
      if (event.type === "text-delta") {
        text += event.text;
        textTokens += estimateTextTokens(event.text);
        input.onText(event.text);
      } else if (event.type === "tool-call")
        calls.push({ id: event.id, name: event.name, argumentsJson: event.argumentsJson });
      else if (event.type === "reasoning") reasoning.push(event);
      else if (event.type === "stopped") stopEvidence = event.evidence;
      else if (event.type === "usage") {
        usage = event.usage;
        requestId = event.requestId;
        providerReportedCostUsd = event.providerReportedCostUsd ?? null;
      } else if (event.type === "error") {
        error = event.code;
        if (event.rejected) receiptless = "rejected";
        if (event.providerFailure) providerFailure = true;
        if (event.keyRejection) keyRejection = event.keyRejection;
      }
    }
  } catch {
    error = signal.aborted ? "cancelled" : "provider_unavailable";
    // Before streaming nothing was sent; inside the loop this process stopped reading.
    receiptless = streaming ? "aborted" : "rejected";
  }
  if (!usage) {
    // Stop evidence means the provider responded: whatever it generated is charged, never unknown.
    const cut = signal.aborted || error === "timeout" || stopEvidence !== null;
    if (!receiptless && cut) receiptless = "aborted";
    const outcome = receiptless;
    if (outcome) {
      try {
        if (outcome === "rejected")
          await assistantTransaction((tx) =>
            closeReceiptlessAssistantAttempt(tx, {
              ...grantOf(dispatched),
              outcome,
              providerFailure,
            }),
          );
        else
          await chargeStoppedStep(binding, grantOf(dispatched), {
            text,
            textTokens,
            promptTokens: estimateTextTokens(JSON.stringify(input.body)),
            evidence: stopEvidence,
          });
        const code = error ?? "usage_unknown";
        const keyId = dispatched.hosted?.keyId ?? null;
        // A key refused before the provider ran anything: the attempt closed at zero above.
        if (outcome === "rejected" && keyRejection && keyId && !text && !calls.length) {
          void recordHostedAssistantKeyOutcome(keyId, keyRejection);
          return {
            ...{ text, calls, reasoning, error: code, usage: null, cost: null, unknown: false },
            keyRefusal: { keyId, rejection: keyRejection },
          };
        }
        return { text, calls, reasoning, error: code, usage: null, cost: null, unknown: false };
      } catch {
        // Our own write failed: the attempt stays dispatched and the abandoned sweep charges it.
        await alertSweptAttempt(binding);
        const code = error ?? "usage_unknown";
        return { text, calls, reasoning, error: code, usage: null, cost: null, unknown: true };
      }
    }
    await assistantTransaction((tx) => markAssistantAttemptUnknown(tx, binding.operationId));
    await alertUnknownAttempt(binding);
    const code = error ?? "usage_unknown";
    return { text, calls, reasoning, error: code, usage: null, cost: null, unknown: true };
  }
  const measured = usage;
  const evidence =
    providerReportedCostUsd === null ? measured : { ...measured, providerReportedCostUsd };
  let cost: bigint;
  try {
    cost = priceAssistantUsage(binding.model.provider, binding.model.pricing, measured);
  } catch {
    await assistantTransaction((tx) => markAssistantAttemptUnknown(tx, binding.operationId));
    await alertUnknownAttempt(binding);
    const code = "usage_unknown" as const;
    return { text, calls, reasoning, error: code, usage: null, cost: null, unknown: true };
  }
  try {
    await assistantTransaction(async (tx) => {
      if (binding.funding === "credits")
        await settleAssistantCreditAttempt(
          tx,
          dispatched.grant.operation,
          dispatched.grant.lease,
          cost,
          requestId,
          evidence,
        );
      else
        await settleAssistantAttempt(
          tx,
          dispatched.grant.operation,
          dispatched.grant.lease,
          cost,
          requestId,
          evidence,
        );
      const run = await tx.assistantRun.findUniqueOrThrow({
        where: { id: binding.runId },
        select: { costMicroUsd: true },
      });
      const total = BigInt(run.costMicroUsd?.toString() ?? "0") + cost;
      await tx.assistantRun.update({
        where: { id: binding.runId },
        data: {
          inputTokens: {
            increment:
              measured.inputTokens +
              (binding.model.provider === "anthropic"
                ? measured.cachedInputTokens + measured.cacheWriteTokens
                : 0),
          },
          outputTokens: { increment: measured.outputTokens },
          costMicroUsd: total.toString(),
          costCertainty: "measured",
        },
      });
    });
  } catch {
    // The measured settlement could not be written: the attempt stays dispatched, and the
    // abandoned sweep charges its reservation once every lease has lapsed.
    await alertSweptAttempt(binding);
    return {
      text,
      calls,
      reasoning,
      error: "accounting_unavailable" as const,
      usage: null,
      cost: null,
      unknown: true,
    };
  }
  if (dispatched.hosted) void recordHostedAssistantKeyOutcome(dispatched.hosted.keyId, "ok");
  return { text, calls, reasoning, error, usage, cost, unknown: false };
}
