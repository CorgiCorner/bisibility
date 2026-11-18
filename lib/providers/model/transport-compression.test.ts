import { brotliCompressSync, deflateSync, gzipSync } from "node:zlib";
import { result } from "@/lib/model-playground/contract-fixtures.test-support";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateModelResponse, readModelMetadata } from "./transport";
import {
  assertNoUnexpectedFetch,
  generation,
  interceptedFetch,
  json,
  request,
  streamResponse,
} from "./transport.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let fetchMock: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  fetchMock = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
});

const encodings = [
  { encoding: "gzip", compress: gzipSync },
  { encoding: "br", compress: brotliCompressSync },
  { encoding: "deflate", compress: deflateSync },
];

describe.each(encodings)("decoded $encoding response bounds", ({ encoding, compress }) => {
  it.each([false, true])("accepts valid Fetch-shaped JSON, paid=%s", async (paid) => {
    const body = { model: "upstream/text-v2", answer: "example ".repeat(100) };
    const text = JSON.stringify(body);
    const wireBytes = compress(Buffer.from(text)).byteLength;
    expect(wireBytes).toBeLessThan(Buffer.byteLength(text));
    // Node Fetch exposes decoded body bytes with the original wire headers.
    fetchMock.mockResolvedValueOnce(
      json(text, { headers: { "content-encoding": encoding, "content-length": `${wireBytes}` } }),
    );
    const config = generation();
    config.normalize = vi.fn((response) => ({
      ...result(),
      actualProviderId: "upstream/vendor-a",
      actualModelId: (response.body as typeof body).model,
    }));
    const response = paid
      ? await generateModelResponse(config)
      : await readModelMetadata(request());
    if (paid) {
      expect(config.normalize).toHaveBeenCalledExactlyOnceWith({ body, requestId: null });
      expect(response).toMatchObject({ state: "completed", actualModelId: body.model });
      expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, response);
    } else expect(response).toEqual({ body, requestId: null });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("accepts the decoded cap even when compression overhead exceeds that cap", async () => {
    const text = "{}";
    const wireBytes = compress(Buffer.from(text)).byteLength;
    expect(wireBytes).toBeGreaterThan(Buffer.byteLength(text));
    fetchMock.mockResolvedValueOnce(
      json(text, { headers: { "content-encoding": encoding, "content-length": `${wireBytes}` } }),
    );
    await expect(readModelMetadata({ ...request(), maxResponseBytes: 2 })).resolves.toMatchObject({
      body: {},
    });
  });

  it.each([false, true])(
    "rejects decoded overflow and cancels the stream, paid=%s",
    async (paid) => {
      const text = JSON.stringify({ answer: "é".repeat(500) });
      const bytes = new TextEncoder().encode(text);
      const wireBytes = compress(bytes).byteLength;
      const limit = 128;
      expect(wireBytes).toBeLessThan(limit);
      const { response, cancel } = streamResponse(
        [bytes.subarray(0, limit), bytes.subarray(limit)],
        {
          stall: true,
          headers: { "content-encoding": encoding, "content-length": `${wireBytes}` },
        },
      );
      fetchMock.mockResolvedValueOnce(response);
      const config = { ...generation(), maxResponseBytes: limit };
      await expect(
        paid
          ? generateModelResponse(config)
          : readModelMetadata({ ...request(), maxResponseBytes: limit }),
      ).rejects.toMatchObject({
        code: "invalid_response",
        dispatched: paid,
        financialExposure: paid ? "unknown" : "not_dispatched",
      });
      expect(cancel).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledOnce();
      if (paid) {
        expect(config.normalize).not.toHaveBeenCalled();
        expect(config.observer.settle).toHaveBeenCalledOnce();
        const evidence = vi.mocked(config.observer.settle).mock.calls[0][1];
        expect(modelColumnResultSchema.safeParse(evidence).success).toBe(true);
        expect(evidence).toMatchObject({
          state: "unknown",
          actualProviderId: null,
          actualModelId: null,
          usage: { completeness: "unknown", inputTokens: null },
          providerCost: { amount: null, certainty: "unknown" },
        });
      }
    },
  );

  it.each(["cancelled", "failed"])("keeps %s paid bodies unknown without retry", async (kind) => {
    const config = generation();
    const controller = new AbortController();
    config.context.signal = controller.signal;
    const bytes = new TextEncoder().encode('{"answer":');
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(bytes);
        },
        pull(stream) {
          if (kind === "cancelled") controller.abort();
          else stream.error(new Error("Synthetic stream failure"));
        },
        cancel,
      }),
      {
        headers: {
          "content-type": "application/json",
          "content-encoding": encoding,
          "content-length": `${compress(bytes).byteLength}`,
        },
      },
    );
    fetchMock.mockResolvedValueOnce(response);
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: kind === "cancelled" ? "aborted" : "invalid_response",
      dispatched: true,
      financialExposure: "unknown",
    });
    expect(config.normalize).not.toHaveBeenCalled();
    expect(config.observer.settle).toHaveBeenCalledOnce();
    const evidence = vi.mocked(config.observer.settle).mock.calls[0][1];
    expect(modelColumnResultSchema.safeParse(evidence).success).toBe(true);
    expect(evidence).toMatchObject({
      state: "unknown",
      actualProviderId: null,
      actualModelId: null,
      providerCost: { amount: null, certainty: "unknown" },
    });
    if (kind === "cancelled") expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });
});

it.each([undefined, "identity", " Identity "])(
  "retains identity truncation detection with encoding=%s",
  async (encoding) => {
    const config = generation();
    fetchMock.mockResolvedValueOnce(
      json("{}", {
        headers: {
          "content-length": "20",
          ...(encoding === undefined ? {} : { "content-encoding": encoding }),
        },
      }),
    );
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
      financialExposure: "unknown",
    });
    expect(config.normalize).not.toHaveBeenCalled();
    expect(config.observer.settle).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  },
);
