import { modelColumnResultSchema } from "@/lib/model-playground/types";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { anthropicModelProvider as provider } from "./adapter";
import {
  canary,
  catalogFixture,
  context,
  input,
  observer,
  prompt,
  searchFixture,
  textFixture,
} from "./fixtures.test-support";

vi.mock("@/lib/providers/rate-limit", () => ({
  consumeProviderLimit: vi.fn(async () => ({ success: true })),
}));
let network: ReturnType<typeof interceptedFetch>;
beforeEach(() => {
  network = interceptedFetch();
});
afterEach(() => {
  assertNoUnexpectedFetch();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

it("uses P04's native versioned Messages route with the observer around a single request", async () => {
  const accounting = observer();
  network.mockImplementationOnce(async (url, options) => {
    expect(accounting.beforeDispatch).toHaveBeenCalledExactlyOnceWith("op:p06");
    expect(accounting.settle).not.toHaveBeenCalled();
    expect(String(url)).toBe("https://api.anthropic.com/v1/messages");
    expect(options).toMatchObject({
      method: "POST",
      redirect: "error",
      headers: {
        "anthropic-version": "2026-10-21",
        "x-api-key": canary,
      },
    });
    expect(JSON.parse(String(options?.body))).toEqual({
      model: "claude-opus-5-5",
      max_tokens: 512,
      stream: false,
      system: "Respond in language pl.",
      messages: [{ role: "user", content: prompt }],
    });
    return json(JSON.stringify(textFixture()), {
      headers: { "request-id": "req_123456789abcdef" },
    });
  });
  const result = await provider.generate(context(), input(), accounting);
  expect(modelColumnResultSchema.safeParse(result).success).toBe(true);
  expect(result).toMatchObject({
    state: "completed",
    actualProviderId: null,
    providerRequestId: "req_123456789abcdef",
  });
  expect(accounting.settle).toHaveBeenCalledExactlyOnceWith("op:p06", result);
  expect(network).toHaveBeenCalledOnce();
});

it.each(["US", "PL"])(
  "maps basic search maxCalls and approximate %s country only",
  async (countryCode) => {
    network.mockResolvedValueOnce(json(JSON.stringify(searchFixture())));
    const request = input(true);
    request.column.settings.search.countryCode = countryCode;
    const result = await provider.generate(context(), request, observer());
    const body = JSON.parse(String(network.mock.calls[0][1]?.body));
    expect(body.tools).toEqual([
      {
        type: "web_search_20250305",
        name: "web_search",
        max_uses: 3,
        allowed_callers: ["direct"],
        user_location: { type: "approximate", country: countryCode },
      },
    ]);
    expect(result).toMatchObject({ state: "completed", usage: { searchCalls: 1 } });
    expect(network).toHaveBeenCalledOnce();
  },
);
it("always supplies a bounded search limit when omitted", async () => {
  network.mockResolvedValueOnce(json(JSON.stringify(searchFixture())));
  const request = input(true);
  delete request.column.settings.search.countryCode;
  delete request.column.settings.search.maxCalls;
  await provider.generate(context(), request, observer());
  expect(JSON.parse(String(network.mock.calls[0][1]?.body)).tools).toEqual([
    { type: "web_search_20250305", name: "web_search", max_uses: 10, allowed_callers: ["direct"] },
  ]);
});

it.each([
  { modelId: "claude-opus-5" },
  { providerId: "openai" },
  { settings: { maxOutputTokens: 512, temperature: 0.5, search: { mode: "off" } } },
  { settings: { maxOutputTokens: 512, search: { mode: "web_search_20260209" } } },
  { settings: { maxOutputTokens: 512, search: { mode: "web_search_20260318" } } },
  {
    settings: {
      maxOutputTokens: 512,
      search: { mode: "anthropic_web_search_20250305", countryCode: "ZZ" },
    },
  },
  {
    settings: {
      maxOutputTokens: 512,
      search: { mode: "anthropic_web_search_20250305", maxCalls: 11 },
    },
  },
  { settings: { maxOutputTokens: 512, search: { mode: "off", maxCalls: 1 } } },
  {
    settings: {
      maxOutputTokens: 512,
      search: { mode: "anthropic_web_search_20250305", dynamic_filtering: true },
    },
  },
  { settings: { maxOutputTokens: 4097, search: { mode: "off" } } },
  { settings: { maxOutputTokens: 512, top_p: 0.5, search: { mode: "off" } } },
  { endpoint: "https://example.org/" },
  { tools: [{ type: "bash" }] },
  { payment: { fundingSource: "credits", optionId: "credits:fake" } },
])("rejects unsupported column controls before admission: %j", async (extra) => {
  const accounting = observer();
  const request = { ...input(), column: { ...input().column, ...extra } };
  await expect(provider.generate(context(), request as never, accounting)).rejects.toMatchObject({
    code: "invalid_request",
    dispatched: false,
  });
  expect(network).not.toHaveBeenCalled();
  expect(accounting.beforeDispatch).not.toHaveBeenCalled();
  expect(accounting.settle).not.toHaveBeenCalled();
});
it.each([
  { prompt: "x".repeat(501) },
  { prompt: "\ud800" },
  { responseLanguage: "en;unsafe" },
  { operationKey: "unsafe key" },
  { endpoint: "https://example.org" },
  { stream: true },
])("rejects invalid/extra request input before transport: %j", async (extra) => {
  await expect(
    provider.generate(context(), { ...input(), ...extra } as never, observer()),
  ).rejects.toMatchObject({ code: "invalid_request" });
  expect(network).not.toHaveBeenCalled();
});
it("requires the shared accounting observer", async () => {
  await expect(provider.generate(context(), input(), undefined as never)).rejects.toMatchObject({
    code: "observer_required",
  });
  expect(network).not.toHaveBeenCalled();
});

it.each([
  [401, "invalid_credentials"],
  [403, "refused"],
  [429, "rate_limited"],
  [500, "provider_error"],
  [503, "provider_error"],
])("settles HTTP %s safely without retry or upstream error echoes", async (status, code) => {
  network.mockResolvedValueOnce(
    json(JSON.stringify({ error: `${canary} ${prompt}` }), {
      status: Number(status),
      headers: { "request-id": canary, "retry-after": prompt },
    }),
  );
  const accounting = observer();
  const error = await provider
    .generate(context(), input(), accounting)
    .catch((error: unknown) => error);
  expect(error).toMatchObject({
    code,
    dispatched: true,
    financialExposure: "unknown",
    requestId: null,
  });
  const result = accounting.settle.mock.calls[0][1];
  expect(modelColumnResultSchema.safeParse(result).success).toBe(true);
  expect(JSON.stringify([error, result])).not.toContain(canary);
  expect(JSON.stringify([error, result])).not.toContain(prompt);
  expect(accounting.settle).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledOnce();
});
it("treats a post-dispatch timeout as unknown exposure and never repeats the paid call", async () => {
  vi.useFakeTimers();
  network.mockImplementationOnce(() => new Promise(() => {}));
  const accounting = observer();
  const pending = provider
    .generate(context(), input(), accounting)
    .catch((error: unknown) => error);
  await vi.advanceTimersByTimeAsync(120001);
  expect(await pending).toMatchObject({
    code: "timeout",
    dispatched: true,
    financialExposure: "unknown",
  });
  expect(accounting.settle).toHaveBeenCalledOnce();
  expect(network).toHaveBeenCalledOnce();
  expect(modelColumnResultSchema.safeParse(accounting.settle.mock.calls[0][1]).success).toBe(true);
});
it.each(["tool-error", "pause", "client-tool", "new-tool", "mismatch", "malformed", "error-echo"])(
  "does not continue or execute tools for %s",
  async (scenario) => {
    const body = searchFixture();
    if (scenario === "tool-error")
      body.content = [
        { type: "server_tool_use", id: "srv1", name: "web_search", input: { query: "synthetic" } },
        {
          type: "web_search_tool_result",
          tool_use_id: "srv1",
          content: { type: "web_search_tool_result_error", error_code: `${canary} ${prompt}` },
        },
        { type: "text", text: "Partial answer" },
      ];
    else if (scenario === "pause") {
      body.stop_reason = "pause_turn";
    } else if (scenario === "client-tool") {
      body.stop_reason = "tool_use";
      body.content = [{ type: "tool_use", id: "tool1", name: "bash", input: { command: canary } }];
    } else if (scenario === "new-tool")
      body.content = [
        { type: "server_tool_use", id: "srv1", name: "code_execution", input: { code: prompt } },
      ];
    else if (scenario === "mismatch") body.model = "claude-other";
    else if (scenario === "malformed")
      body.content = [{ type: "text", text: { key: canary, prompt } }];
    else {
      body.type = "error";
      body.error = { message: `${canary} ${prompt}` };
    }
    network.mockResolvedValueOnce(json(JSON.stringify(body)));
    const accounting = observer();
    const result = await provider.generate(context(), input(true), accounting);
    expect(modelColumnResultSchema.safeParse(result).success).toBe(true);
    expect(result.state).not.toBe("completed");
    expect(result.usage.inputTokens).toBe(10);
    expect(JSON.stringify(result)).not.toContain(canary);
    expect(JSON.stringify(result)).not.toContain(prompt);
    expect(accounting.settle).toHaveBeenCalledOnce();
    expect(network).toHaveBeenCalledOnce();
  },
);

it("performs an explicit non-generating metadata probe only", async () => {
  network.mockResolvedValueOnce(json(JSON.stringify(catalogFixture())));
  const result = await provider.probe(context());
  expect(result.state).toBe("catalog_available");
  expect(network).toHaveBeenCalledOnce();
  expect(network.mock.calls[0][1]).toMatchObject({ method: "GET" });
  expect(network.mock.calls[0][1]?.body).toBeUndefined();
});
