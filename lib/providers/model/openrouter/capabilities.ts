import type { ModelCatalogEntry } from "@/lib/providers/model/types";

export const CAPABILITY_VERSION = "mp-p07-models-20261117-v3";
export const REVIEWED_AT = "2026-11-17T00:00:00.000Z";
export const MODEL_ID = "openai/gpt-5.2";
export const ROUTING = Object.freeze({ slug: "openai", reported: "OpenAI" });
export const REVIEWED_MODELS = [
  { id: MODEL_ID, routing: ROUTING },
  { id: "google/gemini-4-hydrogen", routing: { slug: "google-vertex/global", reported: "Google" } },
  { id: "deepseek/deepseek-v4.1-flash-1017", routing: { slug: "wafer/us", reported: "Wafer" } },
] as const;
export function reviewedModel(id: string) {
  return REVIEWED_MODELS.find((model) => model.id === id);
}
export const TEXT_DOCUMENTATION =
  "https://openrouter.ai/docs/api/api-reference/chat/create-a-chat-completion";
export const SEARCH_DOCUMENTATION = "https://openrouter.ai/docs/guides/features/plugins/web-search";

/** Exact candidate only; fixture verification is offline, never account entitlement. */
export function curatedEntry(
  maxOutputTokens: number,
  temperature: boolean,
  modelId = MODEL_ID,
): ModelCatalogEntry {
  return {
    providerId: "openrouter",
    modelId,
    sourceKind: "raw_model",
    protocol: "chat_completions",
    capabilityVersion: CAPABILITY_VERSION,
    availability: "fixture_verified",
    text: {
      documentationUrl: TEXT_DOCUMENTATION,
      reviewedAt: REVIEWED_AT,
      fixtureRevision: "mp-p07-synthetic-text-v1",
    },
    maxOutputTokens,
    temperature,
    search: [
      {
        mode: "openrouter_web_exa",
        countryHint: false,
        maxCalls: null,
        evidence: {
          documentationUrl: SEARCH_DOCUMENTATION,
          reviewedAt: REVIEWED_AT,
          fixtureRevision: "mp-p07-synthetic-exa-v1",
        },
      },
    ],
  };
}
