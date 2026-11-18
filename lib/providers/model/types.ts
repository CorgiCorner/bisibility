import type { ModelInterruption } from "@/lib/model-playground/interruption";
import type { ModelColumn, ModelColumnResult } from "@/lib/model-playground/types";

export const NATIVE_MODEL_PROVIDERS = [
  "openai",
  "anthropic",
  "openrouter",
  "vercel_ai_gateway",
] as const;
export type NativeModelProviderId = (typeof NATIVE_MODEL_PROVIDERS)[number];
export type ModelProviderId = NativeModelProviderId;
export type ModelSourceKind = "raw_model";
export type ModelProtocol = "responses" | "messages" | "chat_completions";
export type ModelSearchMode =
  | "off"
  | "openai_web_search"
  | "anthropic_web_search_20250305"
  | "openrouter_web_exa"
  | "gateway_perplexity_search";

/** Documentation is necessary but never sufficient to enable a runnable route. */
export type ModelCapabilityEvidence = {
  documentationUrl: string;
  reviewedAt: string;
  fixtureRevision: string | null;
};

export type ModelCatalogEntry = {
  providerId: ModelProviderId;
  modelId: string;
  sourceKind: ModelSourceKind;
  protocol: ModelProtocol;
  capabilityVersion: string;
  availability: "unavailable" | "fixture_verified";
  text: ModelCapabilityEvidence;
  maxOutputTokens: number;
  temperature: boolean;
  search: {
    mode: Exclude<ModelSearchMode, "off">;
    countryHint: boolean;
    maxCalls: number | null;
    evidence: ModelCapabilityEvidence;
  }[];
};

/** Server-owned, account-scoped; validate with modelCatalogSnapshotSchema before caching. */
export type ModelCatalogSnapshot = {
  version: 1;
  providerId: ModelProviderId;
  accountDigest: string;
  fetchedAt: string;
  expiresAt: string;
  capabilityVersion: string;
  models: ModelCatalogEntry[];
  workspaceId?: string;
  recognition?: {
    traversal: "complete";
    recognition: "complete" | "partial";
    skippedEntries: number;
  };
};

/** A list/probe proves metadata access only, never generation entitlement. */
export type ModelProbeResult =
  | { state: "catalog_available"; catalog: ModelCatalogSnapshot }
  | {
      state: "invalid_key" | "unavailable" | "no_supported_models";
      catalog: null;
      workspaceIssue?: "selection_missing" | "selection" | "access";
    };

/** P04/P09 must implement this fence and native settlement before enabling adapters. */
export type ModelUsageObserver = {
  beforeDispatch(operationKey: string): Promise<void>;
  settle(
    operationKey: string,
    result: ModelColumnResult,
    interruption?: ModelInterruption,
  ): Promise<void>;
};

/** Server-only arguments; these must never enter a catalog, report or browser projection. */
export type ModelProviderContext = {
  apiKey: string;
  accountDigest: string;
  signal: AbortSignal;
  workspaceId?: string;
};

export type ModelProvider = {
  id: NativeModelProviderId;
  probe(context: ModelProviderContext): Promise<ModelProbeResult>;
  generate(
    context: ModelProviderContext,
    input: {
      column: ModelColumn;
      operationKey: string;
      prompt: string;
      responseLanguage: string;
    },
    observer: ModelUsageObserver,
  ): Promise<ModelColumnResult>;
};
