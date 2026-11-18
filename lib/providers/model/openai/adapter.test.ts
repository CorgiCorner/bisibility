import { modelColumnResultSchema } from "@/lib/model-playground/types";
import {
  assertNoUnexpectedFetch,
  interceptedFetch,
  json,
} from "@/lib/providers/model/transport.test-support";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openAIModelProvider } from "./adapter";
import {
  column,
  context,
  input,
  observer,
  plainFixture,
  searchFixture,
} from "./adapter.test-support";

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

describe("native Responses dispatch", () => {
  it.each(["gpt-4.1", "gpt-4.1-2025-04-14", "gpt-5", "gpt-5-2025-08-07"])(
    "fences one exact %s request and settles P01 evidence",
    async (model) => {
      const config = { ...input(), column: column(model) };
      const fixture = plainFixture();
      fixture.model = model.startsWith("gpt-5") ? "gpt-5-2025-08-07" : fixture.model;
      const fence = observer();
      fetchMock.mockImplementationOnce(async (url, options) => {
        expect(url).toBe("https://api.openai.com/v1/responses");
        expect(fence.beforeDispatch).toHaveBeenCalledExactlyOnceWith(config.operationKey);
        const body = JSON.parse(String(options?.body));
        expect(body).toMatchObject({
          model,
          input: config.prompt,
          instructions: "Respond in en.",
          stream: false,
          store: false,
          background: false,
          max_output_tokens: 512,
          tools: [],
          tool_choice: "none",
        });
        expect(body).not.toHaveProperty("max_tool_calls");
        return json(JSON.stringify(fixture));
      });
      const result = await openAIModelProvider.generate(context(), config, fence);
      expect(result).toMatchObject({
        state: "completed",
        column: config.column,
        actualProviderId: "openai",
        actualModelId: fixture.model,
        answer: fixture.output[0].content[0].text,
        providerCost: { amount: null, certainty: "unknown" },
      });
      expect(modelColumnResultSchema.parse(JSON.parse(JSON.stringify(result)))).toEqual(result);
      expect(fence.settle).toHaveBeenCalledExactlyOnceWith(config.operationKey, result);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );

  it("uses only max_tool_calls for bounded optional native search", async () => {
    const config = input();
    config.column = column("gpt-5");
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 2 };
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(searchFixture())));
    const result = await openAIModelProvider.generate(context(), config, observer());
    const body = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(body).toMatchObject({
      max_tool_calls: 2,
      tools: [{ type: "web_search" }],
      tool_choice: "auto",
      reasoning: { effort: "medium" },
    });
    expect(body.tools[0]).not.toHaveProperty("max_uses");
    expect(body).not.toHaveProperty("temperature");
    expect(result.citations).toHaveLength(2);
    expect(result.usage.searchCalls).toBe(1);
    expect(result.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
  });

  it("bounds search to one call when the caller supplies no maximum", async () => {
    const config = input();
    config.column.settings.search = { mode: "openai_web_search" };
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(plainFixture())));
    await openAIModelProvider.generate(context(), config, observer());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body)).max_tool_calls).toBe(1);
  });

  it("forwards supported temperature and native search for the non-reasoning model", async () => {
    const config = input();
    config.column.settings.temperature = 0;
    config.column.settings.search = { mode: "openai_web_search", maxCalls: 1 };
    const raw = searchFixture();
    raw.model = "gpt-4.1-2025-04-14";
    raw.usage.output_tokens_details.reasoning_tokens = 0;
    fetchMock.mockResolvedValueOnce(json(JSON.stringify(raw)));
    const result = await openAIModelProvider.generate(context(), config, observer());
    expect(JSON.parse(String(fetchMock.mock.calls[0][1]?.body))).toMatchObject({
      temperature: 0,
      max_tool_calls: 1,
      tools: [{ type: "web_search" }],
    });
    expect(result).toMatchObject({ state: "completed", actualModelId: raw.model });
  });

  it("settles known model substitution as failed while retaining both identities", async () => {
    const fence = observer();
    fetchMock.mockResolvedValueOnce(
      json(JSON.stringify({ ...plainFixture(), model: "gpt-5-2025-08-07" })),
    );
    const result = await openAIModelProvider.generate(context(), input(), fence);
    expect(result).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      column: { modelId: "gpt-4.1" },
      actualModelId: "gpt-5-2025-08-07",
    });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(input().operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("settles unrequested positive search usage as failed with measured evidence", async () => {
    const fence = observer();
    fetchMock.mockResolvedValueOnce(
      json(
        JSON.stringify({
          ...plainFixture(),
          tool_usage: { web_search: { num_requests: 1 } },
        }),
      ),
    );
    const result = await openAIModelProvider.generate(context(), input(), fence);
    expect(result).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      column: { settings: { search: { mode: "off" } } },
      usage: {
        completeness: "partial",
        inputTokens: 100,
        outputTokens: 40,
        searchCalls: 1,
        searchContentTokens: null,
      },
      providerCost: { amount: null, certainty: "unknown" },
    });
    expect(fence.settle).toHaveBeenCalledExactlyOnceWith(input().operationKey, result);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { modelId: "gpt-4.1-new" },
    { modelId: "gpt-5-image" },
    { providerId: "openrouter" },
    { modelId: "../secret" },
    { settings: { maxOutputTokens: 512, temperature: 3, search: { mode: "off" } } },
    {
      modelId: "gpt-5",
      settings: { maxOutputTokens: 512, temperature: 1, search: { mode: "off" } },
    },
    { settings: { maxOutputTokens: 512, search: { mode: "openrouter_web_exa" } } },
    {
      settings: { maxOutputTokens: 512, search: { mode: "openai_web_search", countryCode: "US" } },
    },
    { settings: { maxOutputTokens: 512, search: { mode: "off", maxCalls: 1 } } },
    { settings: { maxOutputTokens: 512, search: { mode: "openai_web_search", maxCalls: 11 } } },
    { settings: { maxOutputTokens: 4097, search: { mode: "off" } } },
    { settings: { maxOutputTokens: 512, search: { mode: "off" }, tools: ["shell"] } },
  ])("rejects unsupported controls before admission: %j", async (changes) => {
    const config = input();
    Object.assign(config.column, changes);
    const fence = observer();
    await expect(openAIModelProvider.generate(context(), config, fence)).rejects.toMatchObject({
      code: "invalid_request",
      dispatched: false,
    });
    expect(fence.beforeDispatch).not.toHaveBeenCalled();
    expect(fence.settle).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { prompt: "x".repeat(501) },
    { responseLanguage: "arbitrary prompt" },
    { tools: ["shell"] },
    { operationKey: "bad key" },
  ])("rejects malformed generation input", async (changes) => {
    const fence = observer();
    await expect(
      openAIModelProvider.generate(context(), { ...input(), ...changes }, fence),
    ).rejects.toMatchObject({ code: "invalid_request" });
    expect(fence.beforeDispatch).not.toHaveBeenCalled();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    [401, "invalid_credentials"],
    [403, "refused"],
    [429, "rate_limited"],
    [500, "provider_error"],
    [503, "provider_error"],
  ])("sanitizes %i echoes and never retries or falls back", async (status, code) => {
    const fence = observer();
    const echo = `${context().apiKey} ${input().prompt}`;
    fetchMock.mockResolvedValueOnce(
      json(JSON.stringify({ error: echo }), {
        status: Number(status),
        headers: { "x-request-id": context().apiKey, "retry-after": echo },
      }),
    );
    const error = await openAIModelProvider
      .generate(context(), input(), fence)
      .catch((value: unknown) => value);
    expect(error).toMatchObject({
      code,
      dispatched: true,
      financialExposure: "unknown",
      requestId: null,
    });
    const serialized = `${String(error)} ${JSON.stringify(error)} ${JSON.stringify(fence.settle.mock.calls)}`;
    expect(serialized).not.toContain(context().apiKey);
    // The frozen request column contains no prompt; no error body or header is retained.
    expect(serialized).not.toContain(input().prompt);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fence.settle).toHaveBeenCalledTimes(1);
  });

  it("settles timeout after dispatch as unknown exposure without replay", async () => {
    vi.useFakeTimers();
    const fence = observer();
    fetchMock.mockImplementationOnce(() => new Promise(() => {}));
    const pending = openAIModelProvider
      .generate(context(), input(), fence)
      .catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(120001);
    expect(await pending).toMatchObject({
      code: "timeout",
      dispatched: true,
      financialExposure: "unknown",
    });
    expect(fence.settle.mock.calls[0]).toEqual([
      input().operationKey,
      expect.objectContaining({
        state: "unknown",
        failure: "timeout",
        providerCost: expect.objectContaining({ amount: null }),
      }),
      expect.objectContaining({ reason: "timeout", requestBytes: expect.any(Number) }),
    ]);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each(["bad\nmodel", "SYNTHETIC-ARBITRARY-CREDENTIAL-CANARY"])(
    "sanitizes malformed/mismatched model %j after dispatch",
    async (model) => {
      const fence = observer();
      fetchMock.mockResolvedValueOnce(
        json(JSON.stringify({ ...plainFixture(), model, diagnostic: input().prompt })),
      );
      const error = await openAIModelProvider
        .generate(context(), input(), fence)
        .catch((value: unknown) => value);
      expect(error).toMatchObject({ code: "invalid_response", dispatched: true });
      expect(fence.settle).toHaveBeenCalledTimes(1);
      expect(JSON.stringify(fence.settle.mock.calls)).not.toContain(context().apiKey);
      expect(JSON.stringify(fence.settle.mock.calls)).not.toContain(input().prompt);
      expect(fetchMock).toHaveBeenCalledTimes(1);
    },
  );
});
