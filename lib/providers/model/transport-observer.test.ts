import { result } from "@/lib/model-playground/contract-fixtures.test-support";
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

describe("mandatory native observer fence", () => {
  it.each([undefined, {}, { beforeDispatch: async () => {} }, { settle: async () => {} }])(
    "refuses a missing/incomplete observer",
    async (observer) => {
      await expect(
        generateModelResponse({ ...generation(), observer } as never),
      ).rejects.toMatchObject({
        code: "observer_required",
        dispatched: false,
        financialExposure: "not_dispatched",
      });
      expect(fetchMock).not.toHaveBeenCalled();
      expect(limiter).not.toHaveBeenCalled();
    },
  );

  it("does not dispatch when admission refuses and never leaks its cause", async () => {
    const config = generation();
    vi.mocked(config.observer.beforeDispatch).mockRejectedValueOnce(new Error(canary));
    const error = await generateModelResponse(config).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "admission_refused", dispatched: false });
    expect(String(error)).not.toContain(canary);
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(config.observer.settle).not.toHaveBeenCalled();
  });

  it("enforces account limits before the fence and never sends an exhausted request", async () => {
    const config = generation();
    limiter.mockResolvedValue({ success: false });
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "rate_limited",
      dispatched: false,
    });
    await expect(readModelMetadata(request())).rejects.toMatchObject({
      code: "rate_limited",
      dispatched: false,
    });
    expect(limiter).toHaveBeenCalledWith(config.providerId, { apiKey: config.context.apiKey });
    expect(config.observer.beforeDispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("aborts before admission without any dispatch", async () => {
    const config = generation();
    const controller = new AbortController();
    controller.abort(canary);
    config.context.signal = controller.signal;
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "aborted",
      dispatched: false,
    });
    expect(config.observer.beforeDispatch).not.toHaveBeenCalled();
    expect(config.observer.settle).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("settles an approved fence cancelled before I/O without claiming zero usage", async () => {
    const config = generation();
    const controller = new AbortController();
    config.context.signal = controller.signal;
    vi.mocked(config.observer.beforeDispatch).mockImplementationOnce(async () => {
      controller.abort(canary);
    });
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "aborted",
      dispatched: false,
    });
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
      config.operationKey,
      expect.objectContaining({
        state: "cancelled",
        usage: expect.objectContaining({ completeness: "unknown", inputTokens: null }),
        providerCost: expect.objectContaining({ amount: null }),
      }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("awaits durable admission after cancellation so a late fence is settled", async () => {
    const config = generation();
    const controller = new AbortController();
    config.context.signal = controller.signal;
    let release = () => {};
    vi.mocked(config.observer.beforeDispatch).mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const outcome = generateModelResponse(config).catch((error: unknown) => error);
    await vi.waitFor(() => expect(config.observer.beforeDispatch).toHaveBeenCalled());
    controller.abort(canary);
    release();
    expect(await outcome).toMatchObject({ code: "aborted", dispatched: false });
    expect(config.observer.settle).toHaveBeenCalledTimes(1);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("preserves ambiguity when aborted after dispatch during a body read", async () => {
    const config = generation();
    const controller = new AbortController();
    config.context.signal = controller.signal;
    const cancel = vi.fn();
    const response = new Response(
      new ReadableStream<Uint8Array>({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('{"usage":'));
        },
        pull() {
          controller.abort(canary);
        },
        cancel,
      }),
      { headers: { "content-type": "application/json" } },
    );
    fetchMock.mockResolvedValueOnce(response);
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "aborted",
      dispatched: true,
      financialExposure: "unknown",
    });
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
      config.operationKey,
      expect.objectContaining({
        state: "unknown",
        failure: "accounting_unknown",
        providerCost: expect.objectContaining({ certainty: "unknown", amount: null }),
      }),
      expect.objectContaining({
        version: 1,
        reason: "aborted",
        requestBytes: expect.any(Number),
        requestTokens: expect.any(Number),
        reasoning: false,
        elapsedMs: expect.any(Number),
      }),
    );
    expect(cancel).toHaveBeenCalledOnce();
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("freezes column, body, key and observer before yielding to admission", async () => {
    const config = generation();
    const original = structuredClone(config.column);
    const settle = config.observer.settle;
    vi.mocked(config.observer.beforeDispatch).mockImplementationOnce(async () => {
      config.column.modelId = "replacement";
      config.body.model = "replacement";
      config.context.apiKey = "changed-key";
      config.observer.settle = async () => {
        throw new Error("Replacement settlement");
      };
    });
    fetchMock.mockImplementationOnce(async (_url, options) => {
      expect(JSON.parse(String(options?.body)).model).toBe(original.modelId);
      expect(new Headers(options?.headers).get("authorization")).toBe(`Bearer ${canary}`);
      return json();
    });
    expect((await generateModelResponse(config)).column).toEqual(original);
    expect(settle).toHaveBeenCalledOnce();
  });

  it("settles conservative evidence if normalization fails, never exposing canary payloads", async () => {
    const config = generation();
    config.normalize = () => {
      throw new Error(canary);
    };
    fetchMock.mockResolvedValueOnce(json(JSON.stringify({ message: canary })));
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: true,
    });
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
      config.operationKey,
      expect.objectContaining({
        state: "unknown",
        answer: null,
        usage: expect.objectContaining({ completeness: "unknown" }),
      }),
    );
    expect(JSON.stringify(vi.mocked(config.observer.settle).mock.calls)).not.toContain(canary);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it("keeps measured native quantities independent of unknown dollars", async () => {
    const config = generation();
    const normalized = result();
    normalized.usage = {
      ...normalized.usage,
      completeness: "complete",
      inputTokens: 15,
      outputTokens: 12,
    };
    config.normalize = () => normalized;
    fetchMock.mockResolvedValueOnce(json());
    const completed = await generateModelResponse(config);
    expect(completed.usage).toMatchObject({ completeness: "complete", inputTokens: 15 });
    expect(completed.providerCost).toMatchObject({ certainty: "unknown", amount: null });
    expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, completed);
  });

  it.each([false, true])(
    "fails closed when settlement is unavailable, upstream failed=%s",
    async (upstreamFailed) => {
      const config = generation();
      vi.mocked(config.observer.settle).mockRejectedValueOnce(new Error(canary));
      fetchMock.mockResolvedValueOnce(json(undefined, { status: upstreamFailed ? 503 : 200 }));
      const error = await generateModelResponse(config).catch((error: unknown) => error);
      expect(error).toMatchObject({
        code: "accounting_unknown",
        dispatched: true,
        financialExposure: "unknown",
      });
      expect(String(error)).not.toContain(canary);
      expect(JSON.stringify(error)).not.toContain(canary);
      expect(config.observer.settle).toHaveBeenCalledOnce();
      expect(fetchMock).toHaveBeenCalledOnce();
    },
  );
});

it("does not send after admission outlives the total deadline", async () => {
  vi.useFakeTimers();
  const config = { ...generation(), timeoutMs: 10 };
  vi.mocked(config.observer.beforeDispatch).mockImplementationOnce(async () => {
    await new Promise((resolve) => setTimeout(resolve, 20));
  });
  const outcome = generateModelResponse(config).catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(20);
  expect(await outcome).toMatchObject({ code: "timeout", dispatched: false });
  expect(config.observer.settle).toHaveBeenCalledExactlyOnceWith(
    config.operationKey,
    expect.objectContaining({
      state: "cancelled",
      failure: "timeout",
      providerCost: expect.objectContaining({ amount: null }),
    }),
  );
  expect(fetchMock).not.toHaveBeenCalled();
});

it("refuses an absent runtime generation input safely", async () => {
  await expect(generateModelResponse(undefined as never)).rejects.toMatchObject({
    code: "observer_required",
    dispatched: false,
  });
  expect(fetchMock).not.toHaveBeenCalled();
});

it("retains the original generation id when a response body is interrupted", async () => {
  const config = generation();
  const controller = new AbortController();
  config.context.signal = controller.signal;
  let timer: ReturnType<typeof setTimeout>;
  fetchMock.mockResolvedValueOnce(
    new Response(
      new ReadableStream({
        start(stream) {
          stream.enqueue(new TextEncoder().encode('{"id":"gen-original","choices":['));
        },
        pull() {
          timer = setTimeout(() => controller.abort(), 10);
          return new Promise(() => {});
        },
      }),
      { headers: { "content-type": "application/json" } },
    ),
  );
  try {
    await expect(generateModelResponse(config)).rejects.toMatchObject({
      code: "aborted",
      dispatched: true,
      requestId: "gen-original",
    });
    expect(config.observer.settle).toHaveBeenCalledWith(
      config.operationKey,
      expect.objectContaining({ providerRequestId: "gen-original" }),
      expect.objectContaining({ reason: "aborted" }),
    );
  } finally {
    clearTimeout(timer!);
  }
});
