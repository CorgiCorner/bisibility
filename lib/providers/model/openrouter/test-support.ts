import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import type { ModelProviderContext, ModelUsageObserver } from "@/lib/providers/model/types";
import { afterEach, beforeEach, expect, vi } from "vitest";
import answer from "./__fixtures__/answer.json";
import metadata from "./__fixtures__/catalog.json";
import search from "./__fixtures__/search.json";
import { MODEL_ID } from "./capabilities";

export const canary = "SYNTHETIC_P07_CANARY_ONLY";
export const normal = () => structuredClone(answer);
export const web = () => structuredClone(search);
export const catalog = () => structuredClone(metadata);
export function context(): ModelProviderContext {
  return { apiKey: canary, accountDigest: "a".repeat(64), signal: new AbortController().signal };
}
export function request() {
  const column = input().columns[0];
  column.modelId = MODEL_ID;
  column.settings = { maxOutputTokens: 256, search: { mode: "off" } };
  return {
    column,
    operationKey: "operation:synthetic-p07",
    prompt: "Synthetic prompt.",
    responseLanguage: "en",
  };
}
export const observer = () => ({
  beforeDispatch: vi.fn<ModelUsageObserver["beforeDispatch"]>(async () => {}),
  settle: vi.fn<ModelUsageObserver["settle"]>(async () => {}),
});

/** Any unexpected network is a failing assertion, even when a probe catches its error. */
export function forbidNetwork() {
  let outbound: ReturnType<typeof vi.fn>;
  beforeEach(() => {
    outbound = vi.fn(() => {
      throw new Error("Unexpected network");
    });
    vi.stubGlobal("fetch", outbound);
  });
  afterEach(() => {
    expect(outbound).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
}
