import { paymentDecimalSchema } from "@/lib/action-payment/schema";
import type { ModelMoney, ModelUsage } from "@/lib/model-playground/types";

export function record(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/** Missing dimensions stay unknown, including server-tool counts with unverified shape. */
export function normalizeUsage(value: unknown): ModelUsage {
  const usage = record(value);
  const input = record(usage.prompt_tokens_details);
  const output = record(usage.completion_tokens_details);
  const inputTokens = count(usage.prompt_tokens);
  const outputTokens = count(usage.completion_tokens);
  const reasoning = count(output.reasoning_tokens);
  const cacheReadInputTokens = count(input.cached_tokens);
  const cacheWriteInputTokens = count(input.cache_write_tokens);
  const reasoningTokens =
    reasoning !== null && outputTokens !== null && reasoning > outputTokens ? null : reasoning;
  const known = [
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadInputTokens,
    cacheWriteInputTokens,
  ];
  return {
    completeness: known.every((quantity) => quantity === null) ? "unknown" : "partial",
    inputTokens,
    outputTokens,
    reasoningTokens,
    cacheReadInputTokens,
    cacheWriteInputTokens,
    // Routed cache inclusion semantics are not established by the reported totals.
    inputCacheAccounting: "unknown",
    cacheWrites: [],
    searchCalls: null,
    searchContentTokens: null,
  };
}

function hasGatewayBilledAttempts(gateway: Record<string, unknown>): boolean {
  const attempts = record(gateway.routing).modelAttempts;
  if (!Array.isArray(attempts) || attempts.length === 0) return false;
  let successes = 0;
  for (const value of attempts) {
    const model = record(value);
    if (
      typeof model.success !== "boolean" ||
      !Array.isArray(model.providerAttempts) ||
      model.providerAttempts.length === 0
    )
      return false;
    let modelSuccesses = 0;
    for (const value of model.providerAttempts) {
      const provider = record(value);
      if (provider.success === false) continue;
      // Official routing/BYOK docs identify system attempts as gateway-credit usage.
      if (provider.success !== true || provider.credentialType !== "system") return false;
      modelSuccesses++;
    }
    const modelSucceeded = modelSuccesses > 0;
    if (modelSuccesses > 1 || model.success !== modelSucceeded) return false;
    successes += modelSuccesses;
  }
  return successes > 0;
}

/** Reported gateway-billed subtotal only; own-key or ambiguous billing stays unknown. */
export function normalizeMoney(gateway: Record<string, unknown>): ModelMoney {
  const cost = paymentDecimalSchema.safeParse(gateway.cost);
  const reported = cost.success && hasGatewayBilledAttempts(gateway);
  return {
    amount: reported ? cost.data : null,
    currency: "USD",
    certainty: reported ? "reported" : "unknown",
    basis: reported ? "provider_response" : "unknown",
    rateCardVersion: null,
  };
}
