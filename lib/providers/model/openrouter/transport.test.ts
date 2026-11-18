import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "@/lib/model-playground/schema";
import { MODEL_TRANSPORT_LIMITS } from "@/lib/providers/model/transport";
import * as transportInput from "@/lib/providers/model/transport-input";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createOpenRouterProvider } from "./adapter";
import { canary, catalog, context, normal, observer, request, web } from "./test-support";

vi.unmock("@/lib/providers/model/transport");
vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));

let outbound: ReturnType<typeof vi.fn<typeof fetch>>;
let unexpected: boolean;
function json(body: unknown, status = 200, headers: HeadersInit = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}
beforeEach(() => {
  unexpected = false;
  outbound = vi.fn<typeof fetch>(async () => {
    unexpected = true;
    throw new Error("Unexpected outbound request");
  });
  vi.stubGlobal("fetch", outbound);
});
afterEach(() => {
  expect(unexpected).toBe(false);
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
async function ready() {
  outbound.mockResolvedValueOnce(json(catalog()));
  const provider = createOpenRouterProvider();
  expect((await provider.probe(context())).state).toBe("catalog_available");
  expect(outbound.mock.calls[0][0]).toBe("https://openrouter.ai/api/v1/models");
  return provider;
}

describe("P04-only dispatch and settlement", () => {
  it.each([
    ["large trailing spaces", "", " ".repeat(50_000)],
    ["large leading spaces", " ".repeat(50_000), ""],
    ["leading/trailing newlines and tabs", "\n\t\r\n", "\t\r\n\t"],
  ])("sends only the validated prompt before admission: %s", async (_name, prefix, suffix) => {
    const provider = await ready();
    const input = request();
    const prompt = input.prompt;
    input.prompt = `${prefix}${prompt}${suffix}`;
    const encode = vi.spyOn(transportInput, "encodeBody");
    const fence = observer();
    let admittedBody = "";
    fence.beforeDispatch.mockImplementationOnce(async () => {
      expect(encode).toHaveBeenCalledOnce();
      admittedBody = encode.mock.results[0].value;
      const content = JSON.parse(admittedBody).messages[1].content;
      expect(content).toBe(prompt);
      expect(Array.from(content).length).toBeLessThanOrEqual(
        MODEL_PLAYGROUND_LIMITS.promptCharacters,
      );
      expect(utf8Bytes(content)).toBeLessThanOrEqual(MODEL_PLAYGROUND_LIMITS.promptBytes);
      expect(utf8Bytes(admittedBody)).toBeLessThan(MODEL_PLAYGROUND_LIMITS.promptBytes);
      expect(outbound).toHaveBeenCalledTimes(1);
    });
    outbound.mockImplementationOnce(async (_url, init) => {
      expect(fence.beforeDispatch).toHaveBeenCalledOnce();
      expect(init?.body).toBe(admittedBody);
      expect(JSON.parse(String(init?.body)).messages[1].content).toBe(prompt);
      return json(normal());
    });
    expect((await provider.generate(context(), input, fence)).state).toBe("completed");
    expect(fence.settle).toHaveBeenCalledOnce();
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it.each([
    ["conflicting labels", "Azure", "OpenAI"],
    ["unrepresentable top-level label", "Google AI Studio", undefined],
    ["unrepresentable selected label", undefined, "Google AI Studio"],
  ])(
    "settles measured usage for %s without replay",
    async (_name, providerLabel, selectedLabel) => {
      const provider = await ready();
      outbound.mockResolvedValueOnce(
        json({
          ...normal(),
          provider: providerLabel,
          openrouter_metadata: {
            endpoints: { available: [{ provider: selectedLabel, selected: true }] },
          },
        }),
      );
      const fence = observer();
      const result = await provider.generate(context(), request(), fence);
      expect(result).toMatchObject({
        state: "failed",
        failure: "provider_error",
        actualProviderId: null,
        usage: { inputTokens: 194, outputTokens: 20 },
        providerCost: { amount: "0.000123456789", certainty: "reported" },
      });
      expect(fence.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, result);
      expect(outbound).toHaveBeenCalledTimes(2);
    },
  );

  it("fences a single fixed POST, retains the response and settles once", async () => {
    const provider = await ready();
    const fence = observer();
    outbound.mockImplementationOnce(async (url, init) => {
      expect(fence.beforeDispatch).toHaveBeenCalledOnce();
      expect(fence.settle).not.toHaveBeenCalled();
      expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
      expect(init).toMatchObject({ method: "POST", redirect: "error", cache: "no-store" });
      expect(JSON.parse(String(init?.body))).toMatchObject({
        model: "openai/gpt-5.2",
        stream: false,
      });
      return json(normal(), 200, { "x-request-id": "req_SYNTHETICP07ID" });
    });
    const result = await provider.generate(context(), request(), fence);
    expect(result).toMatchObject({ state: "completed", providerRequestId: normal().id });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(request().operationKey, result);
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it.each([
    [normal(), "0.000123456789"],
    [web(), null],
    [{ ...normal(), usage: { cost: null } }, null],
    [{ ...normal(), usage: undefined }, null],
  ])("settles known or missing usage/cost without retry", async (body, amount) => {
    const provider = await ready();
    outbound.mockResolvedValueOnce(json(body));
    const fence = observer();
    expect((await provider.generate(context(), request(), fence)).providerCost.amount).toBe(amount);
    expect(fence.settle).toHaveBeenCalledOnce();
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it.each([
    [401, "invalid_credentials"],
    [403, "refused"],
    [429, "rate_limited"],
    [500, "provider_error"],
    [503, "provider_error"],
  ])("sanitizes HTTP %s, settles ambiguity and never retries", async (status, code) => {
    const provider = await ready();
    const fence = observer();
    outbound.mockResolvedValueOnce(
      json(
        { error: { message: `${canary} ${request().prompt}`, headers: { authorization: canary } } },
        status as number,
        { "x-request-id": canary },
      ),
    );
    await expect(provider.generate(context(), request(), fence)).rejects.toMatchObject({
      code,
      financialExposure: "unknown",
    });
    expect(fence.settle).toHaveBeenCalledOnce();
    expect(JSON.stringify(fence.settle.mock.calls)).not.toContain(canary);
    expect(JSON.stringify(fence.settle.mock.calls)).not.toContain(request().prompt);
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it.each([
    [
      "malformed",
      () => new Response('{"choices":', { headers: { "content-type": "application/json" } }),
    ],
    [
      "oversized",
      () =>
        new Response("{}", {
          headers: {
            "content-type": "application/json",
            "content-length": String(MODEL_TRANSPORT_LIMITS.responseBytes + 1),
          },
        }),
    ],
    [
      "truncated",
      () =>
        new Response("{}", {
          headers: { "content-type": "application/json", "content-length": "1000" },
        }),
    ],
    ["body error echo", () => json({ error: { message: canary } })],
    ["key identity echo", () => json({ ...normal(), provider: canary })],
  ])("rejects %s output without paid replay", async (_name, response) => {
    const provider = await ready();
    outbound.mockResolvedValueOnce(response());
    const fence = observer();
    await expect(provider.generate(context(), request(), fence)).rejects.toMatchObject({
      code: "invalid_response",
      financialExposure: "unknown",
    });
    expect(JSON.stringify(fence.settle.mock.calls)).not.toContain(canary);
    expect(fence.settle).toHaveBeenCalledOnce();
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it("leaves timeout after dispatch unknown and settles exactly once", async () => {
    vi.useFakeTimers();
    const provider = await ready();
    let dispatched = false;
    outbound.mockImplementationOnce(async () => {
      dispatched = true;
      return new Promise<Response>(() => {});
    });
    const fence = observer();
    const promise = provider.generate(context(), request(), fence);
    const assertion = expect(promise).rejects.toMatchObject({
      code: "timeout",
      dispatched: true,
      financialExposure: "unknown",
    });
    await vi.advanceTimersByTimeAsync(MODEL_TRANSPORT_LIMITS.timeoutMs);
    await assertion;
    expect(dispatched).toBe(true);
    expect(fence.settle).toHaveBeenCalledOnce();
    expect(fence.settle.mock.calls[0][1]).toMatchObject({
      state: "unknown",
      failure: "timeout",
      providerCost: { amount: null },
    });
    expect(outbound).toHaveBeenCalledTimes(2);
  });

  it("cannot dispatch without an observer or after admission refusal", async () => {
    const provider = await ready();
    await expect(provider.generate(context(), request(), undefined as never)).rejects.toMatchObject(
      { code: "observer_required" },
    );
    const fence = observer();
    fence.beforeDispatch.mockRejectedValueOnce(new Error(canary));
    await expect(provider.generate(context(), request(), fence)).rejects.toMatchObject({
      code: "admission_refused",
      dispatched: false,
    });
    expect(fence.settle).not.toHaveBeenCalled();
    expect(outbound).toHaveBeenCalledTimes(1);
  });

  it("does not retry when durable settlement fails", async () => {
    const provider = await ready();
    outbound.mockResolvedValueOnce(json(normal()));
    const fence = observer();
    fence.settle.mockRejectedValueOnce(new Error(canary));
    await expect(provider.generate(context(), request(), fence)).rejects.toMatchObject({
      code: "accounting_unknown",
      financialExposure: "unknown",
    });
    expect(outbound).toHaveBeenCalledTimes(2);
    expect(fence.settle).toHaveBeenCalledOnce();
  });
});
