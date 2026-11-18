import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateModelResponse, readModelMetadata } from "./transport";
import {
  assertNoUnexpectedFetch,
  canary,
  generation,
  interceptedFetch,
  json,
  request,
} from "./transport.test-support";
import { NATIVE_MODEL_PROVIDERS } from "./types";

const limiter = vi.hoisted(() => vi.fn(async () => ({ success: true })));
vi.mock("@/lib/providers/rate-limit", () => ({ consumeProviderLimit: limiter }));
let fetchMock: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  fetchMock = interceptedFetch();
  limiter.mockClear();
  limiter.mockResolvedValue({ success: true });
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("fixed native transport routes", () => {
  it.each(NATIVE_MODEL_PROVIDERS)(
    "uses a fixed %s GET for explicit metadata only",
    async (providerId) => {
      fetchMock.mockResolvedValueOnce(json());
      await readModelMetadata({ ...request(), providerId });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [url, options] = fetchMock.mock.calls[0];
      expect(new URL(String(url)).pathname).toMatch(/^\/(?:api\/)?v1\/models$/);
      expect(options).toMatchObject({ method: "GET", redirect: "error", cache: "no-store" });
      expect(options?.body).toBeUndefined();
    },
  );

  it.each(NATIVE_MODEL_PROVIDERS)("fences and settles exactly one %s POST", async (providerId) => {
    const config = generation();
    config.providerId = providerId;
    config.column.providerId = providerId;
    fetchMock.mockImplementationOnce(async (_url, options) => {
      expect(config.observer.beforeDispatch).toHaveBeenCalledWith(config.operationKey);
      expect(options?.method).toBe("POST");
      expect(options?.redirect).toBe("error");
      expect(JSON.parse(String(options?.body)).model).toBe(config.column.modelId);
      return json(undefined, { headers: { "x-request-id": "req_123456789abc" } });
    });
    const completed = await generateModelResponse(config);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, completed);
    expect(completed.column).toEqual(config.column);
    expect(completed.providerRequestId).toBe("req_123456789abc");
    expect(completed.providerCost.amount).toBeNull();
  });

  it.each([
    "https://example.org/custom",
    "http://127.0.0.1",
    "http://10.0.0.1",
    "http://[::1]",
    "https://user:pass@example.com/v1/models",
    "/v1/messages",
    "//example.org",
    "https://example.com/\n",
  ])("rejects endpoint override %s before any fetch", async (endpoint) => {
    for (const key of ["endpoint", "url", "origin", "path", "baseUrl", "method", "headers"]) {
      await expect(readModelMetadata({ ...request(), [key]: endpoint })).rejects.toMatchObject({
        code: "invalid_request",
      });
      await expect(
        generateModelResponse({ ...generation(), [key]: endpoint }),
      ).rejects.toMatchObject({ code: "invalid_request" });
    }
    await expect(
      readModelMetadata({ ...request(), context: { ...request().context, endpoint } as never }),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    "https://example.org/model",
    "../model",
    "a/../../b",
    "//example.org",
    "model\r\n",
    "a?url=https://example.com",
    "http://127.0.0.1",
    "a/%2e%2e/b",
  ])("rejects poisoned model %s", async (modelId) => {
    const config = generation();
    config.column.modelId = modelId;
    config.body.model = modelId;
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_request",
      dispatched: false,
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("keeps slash-qualified IDs in JSON data", async () => {
    fetchMock.mockResolvedValueOnce(json());
    const config = generation();
    await generateModelResponse(config);
    const [url, options] = fetchMock.mock.calls[0];
    expect(String(url)).not.toContain(config.column.modelId);
    expect(new URL(String(url)).pathname).toBe("/api/v1/chat/completions");
    expect(JSON.parse(String(options?.body)).model).toBe(config.column.modelId);
  });

  it.each(["dataforseo", "__proto__", "https://example.com", "constructor"])(
    "rejects unknown route %s",
    async (providerId) => {
      await expect(readModelMetadata({ ...request(), providerId } as never)).rejects.toMatchObject({
        code: "invalid_request",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("refuses streaming, mismatched models, unsafe JSON and oversized request bodies", async () => {
    for (const extra of [
      { stream: true },
      { model: "different" },
      { messages: ["x".repeat(70_000)] },
      { constructor: "poison" },
    ]) {
      const config = generation();
      config.body = { ...config.body, ...extra };
      await expect(generateModelResponse(config)).rejects.toMatchObject({
        code: "invalid_request",
      });
      expect(config.observer.beforeDispatch).not.toHaveBeenCalled();
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([0, -1, Infinity, NaN, 120001])("rejects unbounded timeout %s", async (timeoutMs) => {
    await expect(readModelMetadata({ ...request(), timeoutMs })).rejects.toMatchObject({
      code: "invalid_request",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([0, Infinity, 1048577])(
    "rejects unbounded response limit %s",
    async (maxResponseBytes) => {
      await expect(readModelMetadata({ ...request(), maxResponseBytes })).rejects.toMatchObject({
        code: "invalid_request",
      });
      expect(fetchMock).not.toHaveBeenCalled();
    },
  );

  it("does not expose upstream request ID canary echoes", async () => {
    for (const id of [
      canary,
      `${canary}suffix`,
      `Authorization: Bearer ${canary}`,
      `https://example.org/?key=${canary}`,
    ]) {
      fetchMock.mockResolvedValueOnce(json(undefined, { headers: { "x-request-id": id } }));
      expect((await readModelMetadata(request())).requestId).toBeNull();
    }
  });
});
