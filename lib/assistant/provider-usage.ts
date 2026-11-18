import type { LanguageModelV4Usage, SharedV4ProviderMetadata } from "@ai-sdk/provider";
import type { AssistantUsage } from "./pricing";
import { object } from "./provider-types";
import type { AssistantProvider } from "./wire";

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Maps an AI SDK usage receipt onto the pricing contract. A receipt without input or output
 * totals is no receipt at all (null), never zero usage. OpenAI and OpenRouter report inclusive
 * input (cached and written tokens are part of the total and cache writes bill at the input
 * rate); Anthropic reports uncached input separately, so writes keep their own rate. Reasoning
 * tokens are part of the output total and bill as output.
 */
export function assistantUsageFromSdk(
  provider: AssistantProvider,
  usage: LanguageModelV4Usage,
): AssistantUsage | null {
  const input = count(usage.inputTokens.total);
  const output = count(usage.outputTokens.total);
  const cached = count(usage.inputTokens.cacheRead ?? 0);
  const write = count(usage.inputTokens.cacheWrite ?? 0);
  const reasoning = count(usage.outputTokens.reasoning ?? 0);
  if (input === null || output === null || cached === null || write === null || reasoning === null)
    return null;
  if (reasoning > output) return null;
  if (provider === "anthropic") {
    const uncached = count(usage.inputTokens.noCache);
    if (uncached === null || uncached + cached + write !== input) return null;
    return {
      inputTokens: uncached,
      cachedInputTokens: cached,
      cacheWriteTokens: write,
      outputTokens: output,
      reasoningTokens: reasoning,
    };
  }
  if (cached + write > input) return null;
  return {
    inputTokens: input,
    cachedInputTokens: cached,
    cacheWriteTokens: 0,
    outputTokens: output,
    reasoningTokens: reasoning,
  };
}

/** OpenRouter's own USD figure, kept as evidence only. Undefined when absent, throws when malformed. */
export function providerReportedCost(
  provider: AssistantProvider,
  metadata: SharedV4ProviderMetadata | undefined,
): number | undefined {
  if (provider !== "openrouter") return undefined;
  const cost = object(object(object(metadata).openrouter).usage).cost;
  if (cost === undefined || cost === null) return undefined;
  if (typeof cost !== "number" || !Number.isFinite(cost) || cost < 0)
    throw new Error("Invalid provider cost");
  return cost;
}
