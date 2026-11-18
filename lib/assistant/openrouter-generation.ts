import "server-only";
import type { AssistantUsage } from "./pricing";
import { ASSISTANT_PROVIDER_HOSTS } from "./provider-models";
import { object } from "./provider-types";

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

/**
 * Looks a stopped OpenRouter call up by its generation id for the tokens it really billed.
 * OpenRouter publishes the stats a short while after the stream ends, so null (not ready, not
 * found, malformed or unreachable) is an answer the caller retries until its lookup deadline.
 * Prompt tokens are inclusive of cached ones, as in the stream receipt.
 */
export async function lookupOpenRouterGeneration(
  generationId: string,
  apiKey: string,
  fetcher: typeof fetch = fetch,
): Promise<AssistantUsage | null> {
  if (!/^[A-Za-z0-9_-]{1,200}$/.test(generationId)) return null;
  try {
    const response = await fetcher(
      `${ASSISTANT_PROVIDER_HOSTS.openrouter}/generation?id=${encodeURIComponent(generationId)}`,
      { headers: { authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) },
    );
    if (!response.ok) return null;
    const data = object(object(await response.json()).data);
    if (data.id !== undefined && data.id !== generationId) return null;
    const input = count(data.native_tokens_prompt ?? data.tokens_prompt);
    const output = count(data.native_tokens_completion ?? data.tokens_completion);
    const cached = count(data.native_tokens_cached ?? 0);
    const reasoning = count(data.native_tokens_reasoning ?? 0);
    if (input === null || output === null || cached === null || reasoning === null) return null;
    if (cached > input) return null;
    return {
      inputTokens: input,
      cachedInputTokens: cached,
      cacheWriteTokens: 0,
      outputTokens: output,
      reasoningTokens: Math.min(reasoning, output),
    };
  } catch {
    return null;
  }
}
