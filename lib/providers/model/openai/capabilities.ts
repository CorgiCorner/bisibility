import type { ModelCatalogEntry } from "@/lib/providers/model/types";

export const CAPABILITY_VERSION = "responses-text-20261117-v2";
export const FIXTURE_REVISION = "responses-synthetic-v1";
const reviewedAt = "2026-11-17T00:00:00Z";
const families = [
  { alias: "gpt-6-luna", snapshot: "gpt-6-luna", maximum: 128000, temperature: false },
  { alias: "gpt-4.1", snapshot: "gpt-4.1-2025-04-14", maximum: 32768, temperature: true },
  { alias: "gpt-5", snapshot: "gpt-5-2025-08-07", maximum: 128000, temperature: false },
] as const;

/** Exact IDs only. A metadata listing is never evidence of generation entitlement. */
export function capability(modelId: string) {
  return families.find((item) => item.alias === modelId || item.snapshot === modelId);
}

export function acceptsActualModel(requested: string, actual: string) {
  const entry = capability(requested);
  return (
    !!entry && (actual === requested || (requested === entry.alias && actual === entry.snapshot))
  );
}

export function catalogEntry(modelId: string): ModelCatalogEntry | null {
  const entry = capability(modelId);
  if (!entry) return null;
  return {
    providerId: "openai",
    modelId,
    sourceKind: "raw_model",
    protocol: "responses",
    capabilityVersion: CAPABILITY_VERSION,
    availability: "fixture_verified",
    text: {
      documentationUrl: `https://developers.openai.com/api/docs/models/${entry.alias}`,
      reviewedAt,
      fixtureRevision: FIXTURE_REVISION,
    },
    maxOutputTokens: entry.maximum,
    temperature: entry.temperature,
    search: [
      {
        mode: "openai_web_search",
        countryHint: false,
        maxCalls: 10,
        evidence: {
          documentationUrl: "https://developers.openai.com/api/docs/guides/tools-web-search",
          reviewedAt,
          fixtureRevision: FIXTURE_REVISION,
        },
      },
    ],
  };
}
