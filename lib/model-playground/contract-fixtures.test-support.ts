import type { ModelCatalogEntry, ModelCatalogSnapshot } from "@/lib/providers/model/types";
import type { ModelColumnResult, ModelPlaygroundInput, ModelPlaygroundPreview } from "./types";

// Synthetic contract fixtures, not vendor responses or capability verification evidence.
export const now = new Date("2026-11-11T12:00:00Z");
export const connectionId = "conn_aaaaaaaaaaaaaaaaaaaaaaaa";
export const columnId = "019a70b2-0000-7000-8000-000000000001";
export const digest = "a".repeat(64);
export const evidence = {
  documentationUrl: "https://example.com/model-contract",
  reviewedAt: now.toISOString(),
  fixtureRevision: "synthetic-contract-v1",
};
export function entry(overrides: Partial<ModelCatalogEntry> = {}): ModelCatalogEntry {
  return {
    providerId: "openrouter",
    modelId: "vendor/text-model:version.1",
    sourceKind: "raw_model",
    protocol: "chat_completions",
    capabilityVersion: "synthetic-v1",
    availability: "fixture_verified",
    text: evidence,
    maxOutputTokens: 4096,
    temperature: true,
    search: [{ mode: "openrouter_web_exa", countryHint: false, maxCalls: 1, evidence }],
    ...overrides,
  };
}
export function catalog(overrides: Partial<ModelCatalogSnapshot> = {}): ModelCatalogSnapshot {
  return {
    version: 1,
    providerId: "openrouter",
    accountDigest: digest,
    fetchedAt: "2026-11-11T11:00:00Z",
    expiresAt: "2026-11-11T13:00:00Z",
    capabilityVersion: "synthetic-v1",
    models: [entry()],
    ...overrides,
  };
}
export function input(): ModelPlaygroundInput {
  return {
    version: 1,
    prompt: "Compare tools for a small team.",
    responseLanguage: "en",
    columns: [
      {
        columnId,
        providerId: "openrouter",
        connectionId,
        sourceKind: "raw_model",
        modelId: "vendor/text-model:version.1",
        settings: { maxOutputTokens: 512, search: { mode: "off" } },
        payment: { optionId: "own:example", fundingSource: "byok" },
      },
    ],
  };
}
export const unknownUsage = {
  completeness: "unknown" as const,
  inputTokens: null,
  outputTokens: null,
  reasoningTokens: null,
  cacheReadInputTokens: null,
  cacheWriteInputTokens: null,
  inputCacheAccounting: "unknown" as const,
  cacheWrites: [],
  searchCalls: null,
  searchContentTokens: null,
};
export const unknownMoney = {
  amount: null,
  currency: "USD",
  certainty: "unknown" as const,
  basis: "unknown" as const,
  rateCardVersion: null,
};
export function result(): ModelColumnResult {
  return {
    version: 1,
    column: input().columns[0],
    actualProviderId: null,
    actualModelId: "vendor/text-model:version.1",
    providerRequestId: "request:example",
    state: "completed",
    failure: null,
    startedAt: now.toISOString(),
    finishedAt: now.toISOString(),
    durationMs: 0,
    answer: "An answer with two citations.",
    truncation: { provider: false, application: false, citations: false },
    citations: [
      {
        occurrenceId: "citation-1",
        sourceId: "source-1",
        url: "https://example.org/source",
        title: "Source",
        start: 0,
        end: 2,
      },
      {
        occurrenceId: "citation-2",
        sourceId: "source-1",
        url: "https://example.org/source",
        title: "Source",
        start: 3,
        end: 5,
      },
    ],
    usage: { ...unknownUsage },
    providerCost: { ...unknownMoney },
    paymentReceipt: null,
    rawEvidenceId: null,
  };
}
export function preview(): ModelPlaygroundPreview {
  return {
    version: 1,
    previewId: columnId,
    projectId: "project-example",
    createdAt: now.toISOString(),
    expiresAt: "2026-11-11T13:00:00Z",
    configHash: digest,
    input: input(),
    columns: [
      {
        columnId,
        accountDigest: digest,
        credentialVersion: digest,
        capabilityVersion: "synthetic-v1",
        rateCardVersion: null,
        providerEstimate: unknownMoney,
      },
    ],
  };
}
