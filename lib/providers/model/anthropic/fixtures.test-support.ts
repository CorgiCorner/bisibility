import {
  type ModelColumn,
  type ModelColumnResult,
  modelColumnResultSchema,
} from "@/lib/model-playground/types";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import type { ModelTransportResponse } from "@/lib/providers/model/transport-io";
import { afterEach, beforeEach, expect, vi } from "vitest";
import metadata from "./__fixtures__/catalog.json";
import search from "./__fixtures__/search.json";
import text from "./__fixtures__/text.json";
import { MODEL_ID } from "./capabilities";
import { normalizeResponse } from "./normalize";

// All values are invented; documentation supplies shapes only. No live captures.
export const canary = "SYNTHETIC_KEY_P06_123456789";
export const prompt = "SYNTHETIC_PROMPT_P06";
export const context = () => ({
  apiKey: canary,
  accountDigest: "a".repeat(64),
  signal: new AbortController().signal,
});
export const column = (search = false): ModelColumn => ({
  columnId: "019a70b2-0000-7000-8000-000000000006",
  connectionId: "conn_aaaaaaaaaaaaaaaaaaaaaaaa",
  providerId: "anthropic",
  sourceKind: "raw_model",
  modelId: MODEL_ID,
  settings: {
    maxOutputTokens: 512,
    search: search
      ? {
          mode: "anthropic_web_search_20250305",
          maxCalls: 3,
          countryCode: "US",
        }
      : { mode: "off" },
  },
  payment: { fundingSource: "byok", optionId: "own:synthetic" },
});
export const input = (search = false) => ({
  column: column(search),
  operationKey: "op:p06",
  prompt,
  responseLanguage: "pl",
});
export const observer = () => ({
  beforeDispatch: vi.fn(async (_key: string) => {}),
  settle: vi.fn(async (_key: string, _result: ModelColumnResult) => {}),
});
export const textFixture = (): Record<string, unknown> => structuredClone(text);
export const searchFixture = (): Record<string, unknown> => structuredClone(search);
export const catalogFixture = () => structuredClone(metadata);
export const usageFixture = (): Record<string, unknown> => structuredClone(text.usage);
export function forbidNetwork() {
  const network = vi.fn(() => {
    throw new Error("Unexpected network");
  });
  beforeEach(() => {
    network.mockClear();
    vi.stubGlobal("fetch", network);
  });
  afterEach(() => {
    expect(network).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
}
export function normalized(body: unknown = textFixture(), search = false) {
  const response: ModelTransportResponse = { body, requestId: null };
  const result = {
    ...transportEvidence(column(search), Date.now(), null),
    ...normalizeResponse(response, column(search), canary),
  };
  return modelColumnResultSchema.parse(result);
}
