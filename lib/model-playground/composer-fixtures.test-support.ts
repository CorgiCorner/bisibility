import type { ModelCatalogSnapshot } from "@/lib/providers/model/types";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import { type ModelConnection, modelProviderName, newColumn } from "./composer-state";

/** Synthetic in-memory catalog and safe connections. No credentials or network. */
export function composerFixture() {
  const connections: ModelConnection[] = NATIVE_MODEL_PROVIDERS.map((id, index) => ({
    id,
    name: modelProviderName(id),
    status: "connected",
    enabled: true,
    credentialSource: "own",
    hasStoredCredentials: true,
    connectionId: `conn_a${String(index + 1).repeat(23)}`,
  }));
  const protocols = ["responses", "messages", "chat_completions", "chat_completions"] as const;
  const modes = [
    "openai_web_search",
    "anthropic_web_search_20250305",
    "openrouter_web_exa",
    "gateway_perplexity_search",
  ] as const;
  const evidence = {
    documentationUrl: "https://example.com/fixture",
    reviewedAt: "2026-11-12T00:00:00Z",
    fixtureRevision: "fixture-v1",
  };
  const catalogs: ModelCatalogSnapshot[] = NATIVE_MODEL_PROVIDERS.map((providerId, i) => ({
    version: 1,
    providerId,
    accountDigest: "a".repeat(64),
    fetchedAt: "2026-01-01T00:00:00Z",
    expiresAt: "2099-01-01T00:00:00Z",
    capabilityVersion: "fixture-v1",
    models: [
      "vendor/shared-model",
      "vendor/long-model-v2.0:extended-release-with-readable-identifier",
    ].map((modelId) => ({
      providerId,
      modelId,
      sourceKind: "raw_model",
      protocol: protocols[i],
      capabilityVersion: "fixture-v1",
      availability: "fixture_verified",
      text: evidence,
      maxOutputTokens: 2048,
      temperature: i !== 0,
      search:
        i === 1
          ? []
          : [{ mode: modes[i], countryHint: i === 0, maxCalls: i === 0 ? 3 : null, evidence }],
    })),
  }));
  return {
    connections,
    catalogs,
    modelLabels: Object.fromEntries(
      catalogs.map((catalog) => [
        catalog.providerId,
        Object.fromEntries(
          catalog.models.map((model, index) => [
            model.modelId,
            index ? "Reasoning Pro 2" : "General Chat",
          ]),
        ),
      ]),
    ),
    input: {
      version: 1 as const,
      prompt: "Which directories help a small team compare AI tools?",
      responseLanguage: "en",
      columns: [
        newColumn(catalogs[0].models[0], connections[0]),
        newColumn(catalogs[1].models[0], connections[1]),
      ],
    },
  };
}
