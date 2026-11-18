import "server-only";
import { reviewedModel } from "@/lib/providers/model/openrouter/capabilities";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4, SharedV4ProviderOptions } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { AssistantEffort } from "./effort";
import type { ProviderRequest } from "./provider-types";
import type { AssistantProvider } from "./wire";

/**
 * Official API hosts, pinned so a stray *_BASE_URL environment variable can never send a key
 * elsewhere. Direct providers only: no AI Gateway and no fallback models.
 */
export const ASSISTANT_PROVIDER_HOSTS: Readonly<Record<AssistantProvider, string>> = {
  openai: "https://api.openai.com/v1",
  anthropic: "https://api.anthropic.com/v1",
  openrouter: "https://openrouter.ai/api/v1",
};

export function assistantLanguageModel(
  request: Pick<ProviderRequest, "provider" | "model" | "apiKey">,
): LanguageModelV4 {
  const { apiKey, model } = request;
  if (request.provider === "openai")
    return createOpenAI({ apiKey, baseURL: ASSISTANT_PROVIDER_HOSTS.openai }).responses(model);
  if (request.provider === "openrouter") {
    const selected = reviewedModel(model);
    return createOpenRouter({ apiKey, baseURL: ASSISTANT_PROVIDER_HOSTS.openrouter }).chat(model, {
      usage: { include: true },
      ...(selected && model !== "openai/gpt-5.2"
        ? {
            provider: {
              only: [selected.routing.slug],
              order: [selected.routing.slug],
              allow_fallbacks: false,
              require_parameters: true,
            },
          }
        : {}),
    });
  }
  return createAnthropic({ apiKey, baseURL: ASSISTANT_PROVIDER_HOSTS.anthropic })(model);
}

/**
 * Effort is sent only through provider options and never as a thinking budget, so the request's
 * maxOutputTokens stays the hard cap on billed output (reasoning included) for every effort.
 * A budget-based Anthropic request would raise max_tokens by the budget and break that bound.
 */
export function assistantProviderOptions(
  provider: AssistantProvider,
  effort: AssistantEffort | null,
  model?: string,
): SharedV4ProviderOptions {
  if (provider === "openai")
    return { openai: { store: false, ...(effort ? { reasoningEffort: effort } : {}) } };
  if (provider === "anthropic" && model === "claude-haiku-5-5")
    return {
      anthropic: {
        thinking: { type: "adaptive" },
        effort: effort ?? "low",
        cacheControl: { type: "ephemeral", ttl: "5m" },
      },
    };
  if (!effort) return {};
  if (provider === "openrouter") return { openrouter: { reasoning: { effort } } };
  return { anthropic: { effort } };
}
