import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { MODEL_TRANSPORT_LIMITS } from "@/lib/providers/model/transport-input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import errorBody from "./__fixtures__/error.json";
import text from "./__fixtures__/text.json";
import { vercelAiGatewayProvider as adapter } from "./adapter";
import { context, key, observer, request } from "./adapter.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let unexpected: boolean;
let wire: ReturnType<typeof vi.fn<typeof fetch>>;
beforeEach(() => {
  unexpected = false;
  wire = vi.fn<typeof fetch>(async () => {
    unexpected = true;
    throw new Error("Unexpected network");
  });
  vi.stubGlobal("fetch", wire);
});
afterEach(() => {
  expect(unexpected).toBe(false);
  vi.unstubAllGlobals();
  vi.useRealTimers();
});
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "x-request-id": "req_SYNTHETICONLY123" },
  });

describe("P04 boundary integration with synthetic wire responses", () => {
  it("authenticates exactly one fixed POST with the provided key after the fence", async () => {
    const meter = observer();
    wire.mockImplementationOnce(async (url, options) => {
      expect(meter.beforeDispatch).toHaveBeenCalledExactlyOnceWith(request().operationKey);
      expect(url).toBe("https://ai-gateway.vercel.sh/v1/chat/completions");
      expect(options).toMatchObject({
        method: "POST",
        redirect: "error",
        headers: { authorization: `Bearer ${key}` },
      });
      return json(text);
    });
    const result = await adapter.generate(context(), request(), meter);
    expect(modelColumnResultSchema.safeParse(result).success).toBe(true);
    expect(wire).toHaveBeenCalledTimes(1);
    expect(meter.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, result);
  });

  it.each([
    [401, "invalid_credentials"],
    [403, "refused"],
    [429, "rate_limited"],
    [500, "provider_error"],
    [503, "provider_error"],
    [200, "invalid_response"],
  ])("sanitizes status %s wrappers and never retries", async (status, code) => {
    wire.mockResolvedValueOnce(json(errorBody, Number(status)));
    const meter = observer();
    await expect(adapter.generate(context(), request(), meter)).rejects.toMatchObject({
      code,
      dispatched: true,
    });
    expect(wire).toHaveBeenCalledTimes(1);
    expect(meter.settle).toHaveBeenCalledTimes(1);
    const settled = meter.settle.mock.calls[0] as unknown as [string, unknown];
    expect(modelColumnResultSchema.safeParse(settled[1]).success).toBe(true);
    expect(JSON.stringify(settled[1])).not.toContain(key);
    expect(JSON.stringify(settled[1])).not.toContain(request().prompt);
  });

  it.each(["malformed", "oversized"])(
    "settles %s responses as unknown exposure without retry",
    async (kind) => {
      wire.mockResolvedValueOnce(
        new Response(
          kind === "malformed"
            ? "{"
            : JSON.stringify({ content: "x".repeat(MODEL_TRANSPORT_LIMITS.responseBytes) }),
          { headers: { "content-type": "application/json" } },
        ),
      );
      const meter = observer();
      await expect(adapter.generate(context(), request(), meter)).rejects.toMatchObject({
        code: "invalid_response",
        dispatched: true,
      });
      expect(wire).toHaveBeenCalledTimes(1);
      expect(meter.settle).toHaveBeenCalledTimes(1);
    },
  );

  it.each(["abort", "timeout"])(
    "settles a dispatched %s once and exposes no automatic replay",
    async (kind) => {
      vi.useFakeTimers();
      const controller = new AbortController();
      wire.mockImplementationOnce(async () => new Promise<Response>(() => {}));
      const meter = observer();
      const pending = adapter.generate(
        { ...context(), signal: controller.signal },
        request(),
        meter,
      );
      const assertion = expect(pending).rejects.toMatchObject({
        code: kind === "abort" ? "aborted" : "timeout",
        dispatched: true,
        financialExposure: "unknown",
      });
      await vi.advanceTimersByTimeAsync(0);
      expect(wire).toHaveBeenCalledTimes(1);
      if (kind === "abort") controller.abort();
      else await vi.advanceTimersByTimeAsync(MODEL_TRANSPORT_LIMITS.timeoutMs + 1);
      await assertion;
      expect(wire).toHaveBeenCalledTimes(1);
      expect(meter.settle).toHaveBeenCalledTimes(1);
    },
  );

  it("never dispatches an already-cancelled request or one without an observer", async () => {
    const controller = new AbortController();
    controller.abort();
    const meter = observer();
    await expect(
      adapter.generate({ ...context(), signal: controller.signal }, request(), meter),
    ).rejects.toMatchObject({ code: "aborted", dispatched: false });
    await expect(adapter.generate(context(), request(), undefined as never)).rejects.toMatchObject({
      code: "observer_required",
    });
    expect(wire).not.toHaveBeenCalled();
    expect(meter.beforeDispatch).not.toHaveBeenCalled();
  });
});
