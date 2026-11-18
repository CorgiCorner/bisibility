import "server-only";
import { Prisma } from "@/lib/generated/prisma/client";
import { createTransactionMeter, readPaidOperation } from "@/lib/metering/transaction-meter";
import { notifyOps } from "@/lib/ops/notify";
import type { Clock } from "@usagekit/store";
import { OPEN_ATTEMPT_STATUSES, stopCorrectionOf } from "./accounting-deferred";
import { ASSISTANT_METERING_NAMESPACE } from "./accounting-scope";
import { readAssistantGuardConfig } from "./guard-config";
import { parseAssistantModels } from "./model-config";
import { lookupOpenRouterGeneration } from "./openrouter-generation";
import { type AssistantUsage, priceAssistantUsage } from "./pricing";
import { object } from "./provider-types";
import { defaultTransaction, type StopSettlementOptions } from "./stop-settlement";

/**
 * Stopped OpenRouter Credits answers settled at their estimate: looks each generation up and
 * replaces the estimate with the provider-reported cost, more or less, once per attempt. Until
 * the correction deadline a missing answer is asked again next minute; after it the estimate
 * stands. A correction that fails is retried the same way and never touches the first charge.
 * Each generation is looked up with the platform key its attempt was dispatched on; when that key
 * can no longer be used (revoked, disabled, removed) the attempt is skipped, never looked up with
 * another key, and its estimate stands at the deadline.
 */
export async function correctStoppedOpenRouterAttempts(options: StopSettlementOptions = {}) {
  const now = options.clock?.now() ?? new Date();
  const transaction = options.transaction ?? defaultTransaction;
  const lookup = options.lookup ?? lookupOpenRouterGeneration;
  const due = await transaction((tx) =>
    tx.assistantAttempt.findMany({
      where: { status: "settled", usage: { path: ["correction", "state"], equals: "due" } },
      select: { operationId: true, usage: true, providerKeyId: true },
      orderBy: { updatedAt: "asc" },
      take: 50,
    }),
  );
  if (!due.length) return { corrected: 0, kept: 0 };
  const items = due.flatMap((attempt) => {
    const correction = stopCorrectionOf(attempt.usage);
    return correction
      ? [{ operationId: attempt.operationId, correction, keyId: attempt.providerKeyId }]
      : [];
  });
  const expired = items.filter((item) => now >= new Date(item.correction.until));
  const open = items.filter((item) => now < new Date(item.correction.until));
  let kept = 0;
  if (expired.length)
    kept = await transaction(
      (tx) =>
        tx.$executeRaw`UPDATE assistant_attempts
        SET usage=jsonb_set(usage,'{correction,state}','"kept"'), "updatedAt"=${now}
        WHERE "operationId" IN (${Prisma.join(expired.map((item) => item.operationId))})
          AND status='settled' AND usage->'correction'->>'state'='due'`,
    );
  const keys = await attemptKeys(open, options.hostedKey);
  const usable = open.filter((item) => keys.get(item.keyId ?? "env"));
  if (!usable.length) return { corrected: 0, kept };
  const usages = await lookupAll(usable, (item) =>
    lookup(item.correction.generationId, keys.get(item.keyId ?? "env") as string),
  );
  let corrected = 0;
  const balances: AppliedCorrection[] = [];
  for (const item of usable) {
    const usage = usages.get(item.operationId);
    if (!usage) continue;
    try {
      const done = await transaction((tx) =>
        applyStoppedCorrection(tx, { operationId: item.operationId, usage }, options.clock),
      );
      if (done) {
        corrected++;
        if (done.applied) balances.push(done);
      }
    } catch (error) {
      console.error("[assistant] stopped attempt correction failed", {
        operationId: item.operationId,
        error,
      });
    }
  }
  await alertCorrectionDebt(balances, now, transaction, options.notify ?? notifyOps);
  return { corrected, kept };
}

/**
 * The plaintext of every distinct key the due attempts ran on, read once per key. An attempt from
 * before keys were recorded (null) ran on the environment key.
 */
async function attemptKeys(
  items: readonly { keyId: string | null }[],
  hostedKey: StopSettlementOptions["hostedKey"],
) {
  const read =
    hostedKey ??
    (await import("./funding-extension")).hostedAssistantProviderKeyById.bind(null, "openrouter");
  const keys = new Map<string, string | null>();
  for (const id of new Set(items.map((item) => item.keyId ?? "env"))) {
    try {
      keys.set(id, await read(id));
    } catch {
      keys.set(id, null);
    }
  }
  return keys;
}

type AppliedCorrection = { walletId: string; balanceAfterCents: string; applied: boolean };

/** A correction that leaves the wallet more than the threshold (customer cents) below zero. */
export function correctionDebtAlert(balanceAfterCents: string, thresholdCents: number) {
  return Number(balanceAfterCents) < -thresholdCents;
}

/**
 * Debt is never capped (a paid turn never starts at or below zero, so only one step's correction
 * can add to it), but operations hear about a deep one, at most once per wallet per day. A failed
 * alert never undoes or repeats the correction.
 */
async function alertCorrectionDebt(
  balances: readonly AppliedCorrection[],
  now: Date,
  transaction: NonNullable<StopSettlementOptions["transaction"]>,
  notify: typeof notifyOps,
) {
  if (!balances.length) return;
  try {
    const config = await transaction((tx) => readAssistantGuardConfig(tx));
    const threshold = config["assistant.guard.debtAlertCents"];
    for (const item of balances.filter((row) =>
      correctionDebtAlert(row.balanceAfterCents, threshold),
    ))
      await notify({
        dedupeKey: `assistant_credit_debt:${item.walletId}:${now.toISOString().slice(0, 10)}`,
        kind: "assistant_credit_debt",
        severity: "warning",
        title: "An assistant Credits correction left a wallet in debt",
        fields: {
          Wallet: item.walletId,
          "Balance (cents)": item.balanceAfterCents,
          "Alert threshold (cents)": String(-threshold),
        },
      });
  } catch {
    console.error("[assistant] credit debt alert failed");
  }
}

/**
 * One correction under the attempt's row lock: the provider-reported usage, priced at the price
 * version the attempt reserved with, replaces the estimate on the Meter, the wallet, the attempt
 * and the run. An attempt no longer due (already corrected or kept) is left alone.
 */
export async function applyStoppedCorrection(
  tx: Prisma.TransactionClient,
  input: { operationId: string; usage: AssistantUsage },
  clock?: Clock,
): Promise<false | AppliedCorrection> {
  const { operationId, usage } = input;
  await tx.$queryRaw`SELECT id FROM assistant_attempts WHERE "operationId"=${operationId} FOR UPDATE`;
  const attempt = await tx.assistantAttempt.findUnique({
    where: { operationId },
    include: { run: { select: { modelId: true, projectId: true } } },
  });
  const correction = stopCorrectionOf(attempt?.usage);
  if (attempt?.status !== "settled" || correction?.state !== "due") return false;
  if (!attempt.creditHoldId) throw new Error("Only Credits stops are corrected");
  const project = await tx.project.findUnique({
    where: { id: attempt.run.projectId },
    select: { ownerId: true },
  });
  if (!project) throw new Error("Assistant stopped attempt has no project");
  const meter = await createTransactionMeter(tx, clock);
  const operation = await readPaidOperation(meter, {
    namespace: ASSISTANT_METERING_NAMESPACE,
    principal: project.ownerId,
    operationId,
  });
  if (!operation.creditAccountRef) throw new Error("Assistant credit hold is incomplete");
  const model = parseAssistantModels(process.env.ASSISTANT_MODELS_JSON)?.find(
    (item) => item.id === attempt.run.modelId,
  );
  // A price change since the stop leaves the estimate in place rather than mixing two prices.
  if (!model || model.pricing.version !== operation.providerPriceVersion) return false;
  const micro = priceAssistantUsage(model.provider, model.pricing, usage);
  const { correctDeferredAssistantCreditAttempt } = await import("./funding-extension");
  const { wallet } = await correctDeferredAssistantCreditAttempt(
    tx,
    {
      operation,
      walletId: operation.creditAccountRef,
      providerMicro: micro,
      providerRequestId: correction.generationId,
    },
    clock,
  );
  const stored = object(attempt.usage);
  const before = object(stored.settled);
  const tokens = (value: unknown) =>
    typeof value === "number" && Number.isSafeInteger(value) ? value : 0;
  const previousMicro = BigInt(attempt.settledMicroUsd?.toString() ?? "0");
  await tx.assistantAttempt.update({
    where: { operationId },
    data: {
      settledMicroUsd: micro.toString(),
      providerRequestId: correction.generationId,
      usage: {
        ...stored,
        settled: { certainty: "measured", ...usage },
        correction: { ...correction, state: "applied", estimateMicroUsd: previousMicro.toString() },
      } as Prisma.InputJsonObject,
    },
  });
  await tx.$queryRaw`SELECT id FROM assistant_runs WHERE id=${attempt.runId} FOR UPDATE`;
  const run = await tx.assistantRun.findUniqueOrThrow({
    where: { id: attempt.runId },
    select: { costMicroUsd: true },
  });
  const open = await tx.assistantAttempt.count({
    where: { runId: attempt.runId, status: { in: OPEN_ATTEMPT_STATUSES } },
  });
  const estimated = await tx.assistantAttempt.count({
    where: { runId: attempt.runId, usage: { path: ["settled", "certainty"], equals: "estimated" } },
  });
  const cost = BigInt(run.costMicroUsd?.toString() ?? "0") - previousMicro + micro;
  await tx.assistantRun.update({
    where: { id: attempt.runId },
    data: {
      inputTokens: { increment: usage.inputTokens - tokens(before.inputTokens) },
      outputTokens: { increment: usage.outputTokens - tokens(before.outputTokens) },
      costMicroUsd: (cost < 0n ? 0n : cost).toString(),
      costCertainty: open ? "unknown" : estimated ? "estimated" : "measured",
    },
  });
  return {
    walletId: operation.creditAccountRef,
    balanceAfterCents: wallet.balanceAfterCents,
    applied: wallet.applied,
  };
}

/** Lookups run a few at a time and stop after this budget, well inside the activity timeout. */
const LOOKUP_CONCURRENCY = 5;
const LOOKUP_BUDGET_MS = 45000;

async function lookupAll<T extends { operationId: string }>(
  items: T[],
  lookup: (item: T) => Promise<AssistantUsage | null>,
) {
  const usages = new Map<string, AssistantUsage | null>();
  const queue = [...items];
  const stopAt = Date.now() + LOOKUP_BUDGET_MS;
  const worker = async () => {
    for (let item = queue.shift(); item && Date.now() < stopAt; item = queue.shift())
      usages.set(item.operationId, await lookup(item).catch(() => null));
  };
  await Promise.all(Array.from({ length: LOOKUP_CONCURRENCY }, worker));
  return usages;
}
