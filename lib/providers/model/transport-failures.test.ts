import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { generateModelResponse, readModelMetadata } from "./transport";
import {
  assertNoUnexpectedFetch,
  canary,
  dispatch,
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
  vi.useRealTimers();
});

describe.each([true, false])("bounded responses, paid=%s", (paid) => {
  it.each([
    [301, "invalid_response"],
    [302, "invalid_response"],
    [307, "invalid_response"],
    [308, "invalid_response"],
    [401, "invalid_credentials"],
    [403, "refused"],
    [429, "rate_limited"],
    [500, "provider_error"],
    [503, "provider_error"],
  ])("normalizes status %i without reading error echoes", async (status, code) => {
    const config = generation();
    const response = json(
      JSON.stringify({ error: `${canary} https://example.org/?key=${canary}` }),
      {
        status: Number(status),
        headers: {
          location: "http://127.0.0.1/internal",
          "x-request-id": canary,
          "retry-after": canary,
        },
      },
    );
    const read = vi.spyOn(response, "json");
    fetchMock.mockResolvedValueOnce(response);
    const error = await dispatch(paid, config).catch((error: unknown) => error);
    expect(error).toMatchObject({ code, dispatched: paid, requestId: null });
    expect(String(error)).not.toContain(canary);
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(read).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    if (paid) {
      const evidence = vi.mocked(config.observer.settle).mock.calls[0][1];
      expect(evidence).toMatchObject({
        state: "unknown",
        usage: { completeness: "unknown" },
        providerCost: { amount: null, certainty: "unknown" },
      });
      expect(JSON.stringify(evidence)).not.toContain(canary);
    }
  });

  it("rejects a redirected response even when status is successful", async () => {
    const response = json();
    Object.defineProperty(response, "redirected", { value: true });
    fetchMock.mockResolvedValueOnce(response);
    await expect(dispatch(paid)).rejects.toMatchObject({ code: "invalid_response" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    '{"broken":',
    "<html>secret</html>",
    '{"__proto__":{"polluted":true}}',
    '{"nested":{"constructor":"poison"}}',
    "null",
    "[]",
    "7",
    `${'{"x":'.repeat(70)}0${"}".repeat(70)}`,
  ])("rejects malformed or unsafe JSON %s", async (text) => {
    fetchMock.mockResolvedValueOnce(json(text));
    await expect(dispatch(paid)).rejects.toMatchObject({
      code: "invalid_response",
      dispatched: paid,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    "oversized",
    "lying-length",
    "truncated-length",
    "malformed-length",
    "invalid-utf8",
    "stream-error",
  ])("bounds %s streams", async (kind) => {
    const bytes = new TextEncoder().encode(`{"data":"${"a".repeat(1048576)}"}`);
    let response: Response;
    if (kind === "oversized")
      response = streamResponse([bytes.subarray(0, 24), bytes.subarray(24)]).response;
    else if (kind === "lying-length")
      response = json("{}", { headers: { "content-length": "1048577" } });
    else if (kind === "truncated-length")
      response = json("{}", { headers: { "content-length": "20" } });
    else if (kind === "malformed-length")
      response = json("{}", { headers: { "content-length": canary } });
    else if (kind === "invalid-utf8")
      response = streamResponse([new Uint8Array([123, 34, 120, 34, 58, 34, 0xc3])]).response;
    else response = streamResponse([], { fail: true }).response;
    fetchMock.mockResolvedValueOnce(response);
    const error = await dispatch(paid).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "invalid_response", dispatched: paid });
    expect(String(error)).not.toContain(canary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("counts raw UTF-8 bytes rather than characters", async () => {
    fetchMock.mockResolvedValueOnce(json('{"x":"éé"}'));
    const config = { ...generation(), maxResponseBytes: 11 };
    await expect(
      paid
        ? generateModelResponse(config)
        : readModelMetadata({ ...request(), maxResponseBytes: 11 }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("enforces one total deadline across headers and stalled body, cancelling the reader", async () => {
    vi.useFakeTimers();
    const { response, cancel } = streamResponse([new TextEncoder().encode('{"x":')], {
      stall: true,
    });
    fetchMock.mockImplementationOnce(async () => {
      await new Promise((resolve) => setTimeout(resolve, 60));
      return response;
    });
    const config = { ...generation(), timeoutMs: 100 };
    const outcome = (
      paid ? generateModelResponse(config) : readModelMetadata({ ...request(), timeoutMs: 100 })
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    expect(await outcome).toMatchObject({ code: "timeout", dispatched: paid });
    expect(cancel).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("bounds stalled fetch even when the fetch implementation ignores abort", async () => {
    vi.useFakeTimers();
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    const outcome = (
      paid
        ? generateModelResponse({ ...generation(), timeoutMs: 10 })
        : readModelMetadata({ ...request(), timeoutMs: 10 })
    ).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(10);
    expect(await outcome).toMatchObject({ code: "timeout", dispatched: paid });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("normalizes rejected fetch without retry, fallback or raw error cause", async () => {
    fetchMock.mockRejectedValueOnce(new Error(canary));
    const error = await dispatch(paid).catch((error: unknown) => error);
    expect(error).toMatchObject({ code: "network_error", dispatched: paid });
    expect(error).not.toHaveProperty("cause");
    expect(JSON.stringify(error)).not.toContain(canary);
    expect(String(error)).not.toContain(canary);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

it("enforces a monotonic deadline even when empty chunks starve timer callbacks", async () => {
  let chunks = 0;
  const cancel = vi.fn();
  const response = new Response(
    new ReadableStream<Uint8Array>({
      pull(controller) {
        if (++chunks > 500) controller.error(new Error("Stream must be bounded"));
        else controller.enqueue(new Uint8Array());
      },
      cancel,
    }),
    { headers: { "content-type": "application/json" } },
  );
  fetchMock.mockResolvedValueOnce(response);
  let clock = 0;
  const monotonic = vi.spyOn(performance, "now").mockImplementation(() => clock++);
  const outcome = await readModelMetadata({ ...request(), timeoutMs: 10 }).catch(
    (error: unknown) => error,
  );
  monotonic.mockRestore();
  expect(outcome).toMatchObject({ code: "timeout" });
  expect(cancel).toHaveBeenCalledOnce();
  expect(chunks).toBeLessThan(500);
});

it.each(["text/html", "text/plain", "application/octet-stream"])(
  "rejects non-JSON content type %s",
  async (contentType) => {
    fetchMock.mockResolvedValueOnce(json("{}", { headers: { "content-type": contentType } }));
    await expect(readModelMetadata(request())).rejects.toMatchObject({ code: "invalid_response" });
  },
);

it("accepts exact byte bounds and split UTF-8 code points", async () => {
  const bytes = new TextEncoder().encode('{"x":"é"}');
  fetchMock.mockResolvedValueOnce(
    streamResponse([bytes.subarray(0, 7), bytes.subarray(7)]).response,
  );
  const response = await readModelMetadata({ ...request(), maxResponseBytes: bytes.byteLength });
  expect(response.body).toEqual({ x: "é" });
});

it("discards a late response when fetch ignored the expired deadline", async () => {
  vi.useFakeTimers();
  const { response, cancel } = streamResponse([], { stall: true });
  let release = (_response: Response) => {};
  fetchMock.mockImplementationOnce(
    () =>
      new Promise<Response>((resolve) => {
        release = resolve;
      }),
  );
  const outcome = readModelMetadata({ ...request(), timeoutMs: 10 }).catch(
    (error: unknown) => error,
  );
  await vi.advanceTimersByTimeAsync(10);
  expect(await outcome).toMatchObject({ code: "timeout" });
  release(response);
  await vi.advanceTimersByTimeAsync(0);
  expect(cancel).toHaveBeenCalledOnce();
});
