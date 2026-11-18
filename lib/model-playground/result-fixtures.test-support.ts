import type { PlaygroundEntity } from "@/lib/ai-research/model-playground-view";
import { result } from "@/lib/model-playground/contract-fixtures.test-support";
import type { ModelColumnResult } from "@/lib/model-playground/types";

export const entities: PlaygroundEntity[] = [
  {
    id: "project",
    label: "Acme",
    kind: "project",
    aliases: [],
    excludedNames: [],
    domain: "acme.example",
  },
  {
    id: "competitor",
    label: "Northwind",
    kind: "competitor",
    aliases: [],
    excludedNames: [],
    domain: "northwind.example",
  },
];
export function columnResult(index = 0): ModelColumnResult {
  const value = result();
  return {
    ...value,
    column: {
      ...value.column,
      columnId: `019a70b2-0000-7000-8000-${String(index + 1).padStart(12, "0")}`,
      providerId: (["openrouter", "vercel_ai_gateway", "openai", "anthropic"] as const)[index % 4],
      modelId: "vendor/shared-model",
    },
    actualProviderId: "upstream",
    actualModelId: "vendor/shared-model",
    answer: "Northwind is useful. Acme is also named.",
    durationMs: 1250,
    citations: Array.from({ length: 8 }, (_, i) => ({
      occurrenceId: `cite-${i}`,
      sourceId: `source-${i}`,
      title: `Source ${i}`,
      url: `https://acme.example/docs/${i}`,
      start: null,
      end: null,
    })),
    citationTotals: { total: 8, omitted: 0 },
    consultedSources: {
      total: 125,
      omitted: 25,
      truncated: true,
      sources: Array.from({ length: 100 }, (_, i) => ({
        sourceId: `consulted-${i}`,
        title: `Page ${i}`,
        url: `https://research.example/path/${i}`,
      })),
    },
    usage: {
      ...value.usage,
      completeness: "complete",
      inputTokens: 100,
      outputTokens: 50,
      reasoningTokens: 10,
      cacheReadInputTokens: 20,
      cacheWriteInputTokens: 0,
      inputCacheAccounting: "included",
      searchCalls: 2,
      searchContentTokens: 7,
    },
  };
}
