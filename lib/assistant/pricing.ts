import type { AssistantPricing } from "./model-config";
import type { AssistantProvider } from "./wire";

export type AssistantUsage = {
  inputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
};

function tokenCount(value: number): bigint {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid token count");
  return BigInt(value);
}

function roundedMicroUsd(parts: readonly [bigint, number][]): bigint {
  const numerator = parts.reduce((sum, [tokens, rate]) => {
    if (!Number.isSafeInteger(rate) || rate < 0) throw new Error("Invalid price");
    return sum + tokens * BigInt(rate);
  }, 0n);
  return (numerator + 999_999n) / 1_000_000n;
}

export function priceAssistantUsage(
  provider: AssistantProvider,
  pricing: AssistantPricing,
  usage: AssistantUsage,
): bigint {
  const input = tokenCount(usage.inputTokens);
  const cached = tokenCount(usage.cachedInputTokens);
  const write = tokenCount(usage.cacheWriteTokens);
  const output = tokenCount(usage.outputTokens);
  const reasoning = tokenCount(usage.reasoningTokens);
  const inclusiveInput = provider === "openai" || provider === "openrouter";
  if (reasoning > output || (inclusiveInput && (cached > input || write !== 0n))) {
    throw new Error("Inconsistent usage");
  }
  return roundedMicroUsd([
    [inclusiveInput ? input - cached : input, pricing.inputMicroUsdPerMTok],
    [cached, pricing.cachedInputMicroUsdPerMTok],
    [write, pricing.cacheWriteMicroUsdPerMTok],
    [output, pricing.outputMicroUsdPerMTok],
  ]);
}

export function estimateAssistantCost(
  pricing: AssistantPricing,
  promptBytes: number,
  maxOutputTokens: number,
  mayWriteCache: boolean,
): bigint {
  // A byte-level BPE token covers at least one UTF-8 byte, so bytes never undercount tokens.
  const input = tokenCount(promptBytes);
  return roundedMicroUsd([
    [input, pricing.inputMicroUsdPerMTok],
    [mayWriteCache ? input : 0n, pricing.cacheWriteMicroUsdPerMTok],
    [tokenCount(maxOutputTokens), pricing.outputMicroUsdPerMTok],
  ]);
}
