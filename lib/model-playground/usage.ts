import { createHash } from "node:crypto";
import { acceptsActualModel } from "@/lib/providers/model/openai/capabilities";
import { type ModelColumnResult, modelColumnResultSchema } from "./types";
import {
  type ModelNativeUsageReceipt,
  type ModelUsageBinding,
  type ModelUsageEvidence,
  modelNativeUsageReceiptSchema,
  modelUsageBindingSchema,
  modelUsageEvidenceSchema,
} from "./usage-contract";
import type { LoadedModelUsageEvidence } from "./usage-storage";
import { shiftUsageDecimal, valueModelUsage } from "./usage-valuation";

/** Stable across JSON object order, including data read back from JSONB. */
export function modelUsageDigest(value: unknown): string {
  function canonical(item: unknown): unknown {
    if (Array.isArray(item)) return item.map(canonical);
    if (item && typeof item === "object")
      return Object.fromEntries(
        Object.entries(item)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([key, value]) => [key, canonical(value)]),
      );
    return item;
  }
  return createHash("sha256")
    .update(JSON.stringify(canonical(value)))
    .digest("hex");
}

/** Preserve reviewed alias-to-snapshot identity without accepting a model substitution. */
function matchesRequestedModel(
  binding: ModelUsageBinding,
  actual: string | null | undefined,
  provider: string | null | undefined,
) {
  return (
    actual == null ||
    actual === binding.column.modelId ||
    (binding.column.providerId === "openai" &&
      provider === "openai" &&
      acceptsActualModel(binding.column.modelId, actual))
  );
}

function compareMoney(left: string, right: string) {
  const scale = Math.max(left.split(".")[1]?.length ?? 0, right.split(".")[1]?.length ?? 0);
  const a = BigInt(shiftUsageDecimal(left, scale));
  const b = BigInt(shiftUsageDecimal(right, scale));
  return a < b ? -1 : a > b ? 1 : 0;
}

function monetaryConflict(evidence: ModelUsageEvidence | null) {
  const reported = evidence?.costEvidence?.providerReported;
  if (reported?.scope.kind !== "total" || reported.money.amount === null) return undefined;
  const total = reported.money;
  const provider = evidence?.providerCost;
  const upstream = evidence?.costEvidence?.upstreamInference?.total;
  if (
    provider?.certainty === "reported" &&
    provider.amount !== null &&
    (provider.currency !== total.currency ||
      compareMoney(provider.amount, reported.money.amount) !== 0)
  )
    return "provider_total_conflict" as const;
  if (
    upstream?.certainty === "reported" &&
    upstream.amount !== null &&
    upstream.currency === total.currency &&
    compareMoney(upstream.amount, reported.money.amount) > 0
  )
    return "upstream_exceeds_total" as const;
  return undefined;
}

function deriveReceipt(
  binding: ModelUsageBinding,
  evidence: ModelUsageEvidence | null,
  version: ModelNativeUsageReceipt["version"],
): ModelNativeUsageReceipt {
  const usage = evidence?.usage;
  const policy = binding.policy;
  const ttlComplete =
    !policy.cacheWriteTtls.length ||
    (usage?.cacheWrites.length === policy.cacheWriteTtls.length &&
      policy.cacheWriteTtls.every((ttl) =>
        usage.cacheWrites.some((write) => write.ttlSeconds === ttl && write.tokens !== null),
      ) &&
      usage.cacheWrites.reduce((sum, write) => sum + (write.tokens ?? 0), 0) ===
        usage.cacheWriteInputTokens);
  const complete =
    usage?.completeness === "complete" &&
    policy.billableDimensions.every((dimension) => usage[dimension] !== null) &&
    ttlComplete &&
    policy.inputCacheAccounting !== "unknown" &&
    usage.inputCacheAccounting === policy.inputCacheAccounting;
  const usageStatus =
    !usage || usage.completeness === "unknown" ? "unknown" : complete ? "complete" : "partial";
  const routing = version === "model-native-v2" ? evidence?.routingAttemptCredentials : undefined;
  const additionalExposure = routing
    ? routing.completeness === "complete" &&
      routing.attempts.every((attempt) => attempt.credentialSource === "gateway_system")
      ? "none_reported"
      : "unknown"
    : binding.column.providerId === "vercel_ai_gateway"
      ? "unknown"
      : "none_reported";
  const reported = evidence?.costEvidence?.providerReported;
  const conflictReason = monetaryConflict(evidence);
  const total =
    complete &&
    !conflictReason &&
    additionalExposure === "none_reported" &&
    reported?.scope.kind === "total"
      ? reported.money
      : null;
  return {
    version,
    binding,
    evidence,
    usageStatus,
    monetary: {
      status: total ? "reported" : "unavailable",
      total: total ? structuredClone(total) : null,
      ...(conflictReason ? { conflictReason } : {}),
    },
    budgetValuation: valueModelUsage(
      binding,
      usage ?? null,
      complete && additionalExposure === "none_reported",
    ),
    additionalExposure,
  };
}

/** Accept only trusted transport output and a separately frozen server binding, never a client receipt. */
export function createModelUsageReceipt(
  input: ModelUsageBinding,
  response: ModelColumnResult | null,
  version: ModelNativeUsageReceipt["version"] = "model-native-v2",
): ModelNativeUsageReceipt {
  const binding = modelUsageBindingSchema.parse(input);
  let evidence: ModelUsageEvidence | null = null;
  if (response !== null) {
    const result = modelColumnResultSchema.parse(response);
    if (
      modelUsageDigest(result.column) !== modelUsageDigest(binding.column) ||
      !matchesRequestedModel(binding, result.actualModelId, result.actualProviderId)
    )
      throw new Error("Native usage does not belong to the frozen model column.");
    evidence = modelUsageEvidenceSchema.parse({
      providerRequestId: result.providerRequestId,
      actualProviderId: result.actualProviderId,
      actualModelId: result.actualModelId,
      occurredAt: result.finishedAt,
      failed: result.state !== "completed",
      usage: result.usage,
      providerCost: result.providerCost,
      costEvidence: result.costEvidence ?? null,
      ...(version === "model-native-v2" && result.routingAttemptCredentials
        ? { routingAttemptCredentials: result.routingAttemptCredentials }
        : {}),
    });
  }
  return modelNativeUsageReceiptSchema.parse(deriveReceipt(binding, evidence, version));
}

export function validateModelUsageReceipt(
  value: unknown,
  expected: ModelUsageBinding,
): ModelNativeUsageReceipt {
  const parsed = modelNativeUsageReceiptSchema.parse(value);
  const binding = modelUsageBindingSchema.parse(expected);
  if (
    modelUsageDigest(binding) !== modelUsageDigest(parsed.binding) ||
    !matchesRequestedModel(
      binding,
      parsed.evidence?.actualModelId,
      parsed.evidence?.actualProviderId,
    ) ||
    modelUsageDigest(parsed) !==
      modelUsageDigest(deriveReceipt(binding, parsed.evidence, parsed.version))
  )
    throw new Error("Native receipt differs from its retained evidence or binding.");
  return parsed;
}

/** Shared column/history projection. Caller authorizes project access before this scope check. */
export function projectModelUsage(
  value: ModelNativeUsageReceipt,
  projectId: string,
  state: Pick<LoadedModelUsageEvidence, "counted" | "canonicalId">,
) {
  const receipt = validateModelUsageReceipt(value, value.binding);
  if (receipt.binding.projectId !== projectId) throw new Error("Native usage project mismatch.");
  const counted = state.counted === true && state.canonicalId === null;
  const usage = counted ? receipt.evidence?.usage : null;
  const input = usage?.inputTokens ?? null,
    output = usage?.outputTokens ?? null;
  const additional = receipt.binding.policy.inputCacheAccounting === "additional";
  const cacheRead = usage?.cacheReadInputTokens ?? null,
    cacheWrite = usage?.cacheWriteInputTokens ?? null;
  const searchContent = usage?.searchContentTokens ?? null;
  const searchAccounting = receipt.binding.policy.searchContentAccounting;
  const billableSearchContent =
    receipt.binding.policy.billableDimensions.includes("searchContentTokens");
  const total =
    input === null ||
    output === null ||
    receipt.binding.policy.inputCacheAccounting === "unknown" ||
    usage?.inputCacheAccounting !== receipt.binding.policy.inputCacheAccounting ||
    (additional && (cacheRead === null || cacheWrite === null)) ||
    (billableSearchContent && (searchAccounting === "unknown" || searchContent === null))
      ? null
      : BigInt(input) +
        BigInt(output) +
        (additional ? BigInt(cacheRead ?? 0) + BigInt(cacheWrite ?? 0) : 0n) +
        (billableSearchContent && searchAccounting === "additional"
          ? BigInt(searchContent ?? 0)
          : 0n);
  const money = counted ? receipt.monetary.total : null;
  const cents = counted ? receipt.budgetValuation.cents : null;
  const sharedWith = counted ? null : state.canonicalId;
  return {
    counted,
    canonicalId: state.canonicalId,
    version: receipt.version,
    columnId: receipt.binding.column.columnId,
    providerId: receipt.binding.column.providerId,
    modelId: receipt.binding.column.modelId,
    usageStatus: receipt.usageStatus,
    tokens: {
      sharedWith,
      input,
      output,
      cacheRead,
      cacheWrite,
      cacheWrites: usage?.cacheWrites ?? [],
      inputCacheAccounting: usage?.inputCacheAccounting ?? "unknown",
      reasoning: usage?.reasoningTokens ?? null,
      searchContent,
      total: total !== null && total <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(total) : null,
    },
    searchCalls: usage?.searchCalls ?? null,
    cost: {
      sharedWith,
      ...(money
        ? {
            amount: money.amount,
            currency: money.currency,
            certainty: "reported" as const,
            basis: money.basis,
          }
        : cents !== null
          ? {
              amount: shiftUsageDecimal(cents, -2),
              currency: "USD",
              certainty: "estimated" as const,
              basis: "rate_card" as const,
            }
          : {
              amount: null,
              currency: "USD",
              certainty: "unknown" as const,
              basis: "unavailable" as const,
            }),
    },
    costEvidence: receipt.evidence?.costEvidence ?? null,
    monetaryConflict: receipt.monetary.conflictReason ?? null,
    additionalExposure: receipt.additionalExposure,
    reconciliationRequired:
      receipt.usageStatus !== "complete" ||
      receipt.additionalExposure === "unknown" ||
      receipt.monetary.conflictReason !== undefined,
    automaticPaidRetryAllowed: false as const,
  };
}
