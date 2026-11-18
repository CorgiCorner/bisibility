import { input } from "@/lib/model-playground/contract-fixtures.test-support";
import type { ModelProviderContext } from "@/lib/providers/model/types";
import { vi } from "vitest";
import { textModelId } from "./catalog";

export const key = "SYNTHETIC_GATEWAY_KEY_ONLY";
export function context(): ModelProviderContext {
  return { apiKey: key, accountDigest: "a".repeat(64), signal: new AbortController().signal };
}
export function request() {
  const column = input().columns[0];
  column.providerId = "vercel_ai_gateway";
  column.modelId = textModelId;
  column.settings = { maxOutputTokens: 128, search: { mode: "off" } };
  return {
    column,
    operationKey: "operation:synthetic-gateway",
    prompt: "Synthetic prompt",
    responseLanguage: "pl",
  };
}
export function observer() {
  return { beforeDispatch: vi.fn(async () => {}), settle: vi.fn(async () => {}) };
}
