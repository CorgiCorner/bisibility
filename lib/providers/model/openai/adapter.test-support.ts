import type { ModelColumn } from "@/lib/model-playground/types";
import type { ModelProviderContext, ModelUsageObserver } from "@/lib/providers/model/types";
import { vi } from "vitest";
import plain from "./__fixtures__/plain.json";
import search from "./__fixtures__/search.json";

export const plainFixture = () => structuredClone(plain);
export const searchFixture = () => structuredClone(search);
export const context = (): ModelProviderContext => ({
  apiKey: "SYNTHETIC-ARBITRARY-CREDENTIAL-CANARY",
  accountDigest: "a".repeat(64),
  signal: new AbortController().signal,
});
export function column(modelId = "gpt-4.1"): ModelColumn {
  return {
    columnId: "019a70b2-0000-7000-8000-000000000001",
    connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
    providerId: "openai",
    sourceKind: "raw_model",
    modelId,
    settings: { maxOutputTokens: 512, search: { mode: "off" } },
    payment: { optionId: "own:example", fundingSource: "byok" },
  };
}
export const input = () => ({
  column: column(),
  operationKey: "operation:synthetic",
  prompt: "SYNTHETIC-PROMPT-CANARY",
  responseLanguage: "en",
});
export const observer = () => ({
  beforeDispatch: vi.fn<ModelUsageObserver["beforeDispatch"]>(async () => {}),
  settle: vi.fn<ModelUsageObserver["settle"]>(async () => {}),
});
