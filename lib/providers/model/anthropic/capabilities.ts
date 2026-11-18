import type { ModelCatalogEntry } from "@/lib/providers/model/types";

export const CAPABILITY_VERSION = "messages-2026-11-17-haiku55-v1";
export const FIXTURE_REVISION = "mp-p06-doc-synthetic-v1";
export const MODEL_ID = "claude-opus-5-5";
export const HAIKU_MODEL_ID = "claude-haiku-5-5";
export const SUPPORTED_MODEL_IDS: readonly string[] = [MODEL_ID, HAIKU_MODEL_ID];
export const SEARCH_MODE = "anthropic_web_search_20250305";
export const SEARCH_TOOL = "web_search_20250305";
export const MAX_SEARCH_CALLS = 10;
export const REVIEWED_AT = "2026-11-17T00:00:00Z";

export function capability(searchSupported: boolean, modelId = MODEL_ID): ModelCatalogEntry {
  const evidence = (documentationUrl: string) => ({
    documentationUrl,
    reviewedAt: REVIEWED_AT,
    fixtureRevision: FIXTURE_REVISION,
  });
  return {
    providerId: "anthropic",
    modelId,
    sourceKind: "raw_model",
    protocol: "messages",
    capabilityVersion: CAPABILITY_VERSION,
    availability: "fixture_verified",
    text: evidence("https://platform.claude.com/docs/en/api/messages/create"),
    maxOutputTokens: 4096,
    temperature: false,
    search:
      searchSupported && modelId !== HAIKU_MODEL_ID
        ? [
            {
              mode: SEARCH_MODE,
              countryHint: true,
              maxCalls: MAX_SEARCH_CALLS,
              evidence: evidence(
                "https://platform.claude.com/docs/en/agents-and-tools/tool-use/web-search-tool",
              ),
            },
          ]
        : [],
  };
}
