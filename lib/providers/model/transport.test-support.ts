import { input, result } from "@/lib/model-playground/contract-fixtures.test-support";
import { expect, vi } from "vitest";
import { generateModelResponse, type ModelGenerationInput, readModelMetadata } from "./transport";

export const canary = "req_SYNTHETICCANARYONLY123";
export const request = () => ({
  providerId: "openrouter" as const,
  context: { apiKey: canary, accountDigest: "a".repeat(64), signal: new AbortController().signal },
});
export function generation(): ModelGenerationInput {
  return {
    ...request(),
    column: input().columns[0],
    operationKey: "operation:example",
    body: {
      model: input().columns[0].modelId,
      messages: [{ role: "user", content: "Synthetic prompt." }],
    },
    observer: { beforeDispatch: vi.fn(async () => {}), settle: vi.fn(async () => {}) },
    normalize: vi.fn(() => result()),
  };
}
export function json(body = '{"ok":true}', init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return new Response(body, { ...init, headers });
}
let unexpectedFetch = false;
export function assertNoUnexpectedFetch() {
  expect(unexpectedFetch).toBe(false);
}
export function interceptedFetch() {
  unexpectedFetch = false;
  const mock = vi.fn<typeof fetch>(async () => {
    unexpectedFetch = true;
    throw new Error("Unexpected outbound fetch");
  });
  vi.stubGlobal("fetch", mock);
  return mock;
}
export const dispatch = (paid: boolean, config = generation()) =>
  paid ? generateModelResponse(config) : readModelMetadata(request());
export function streamResponse(
  chunks: Uint8Array[],
  options: { fail?: boolean; stall?: boolean; headers?: HeadersInit } = {},
) {
  const cancel = vi.fn();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(chunk);
      if (options.fail) controller.error(new Error(canary));
      else if (!options.stall) controller.close();
    },
    cancel,
  });
  const headers = new Headers(options.headers);
  if (!headers.has("content-type")) headers.set("content-type", "application/json");
  return { response: new Response(body, { headers }), cancel };
}
