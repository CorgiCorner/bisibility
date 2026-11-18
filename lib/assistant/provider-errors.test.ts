import { APICallError, type LanguageModelV4 } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, expect, test, vi } from "vitest";
import {
  collectProviderEvents as collect,
  providerRequest as request,
} from "./provider.test-support";

const models = vi.hoisted(() => ({ current: null as LanguageModelV4 | null }));
vi.mock("./provider-models", async (importActual) => {
  const actual = await importActual<typeof import("./provider-models")>();
  return {
    ...actual,
    assistantLanguageModel: (input: Parameters<typeof actual.assistantLanguageModel>[0]) =>
      models.current ?? actual.assistantLanguageModel(input),
  };
});

afterEach(() => {
  models.current = null;
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

function failing(error: unknown) {
  const model = new MockLanguageModelV4({
    doStream: async () => {
      throw error;
    },
  });
  models.current = model;
  return model;
}
function callError(statusCode: number, responseBody?: string) {
  return new APICallError({
    message: `status ${statusCode}`,
    url: "https://api.openai.com/v1/responses",
    requestBodyValues: {},
    statusCode,
    responseBody,
    isRetryable: statusCode >= 429,
  });
}

// Nothing arrived before the failure, so every one costs nothing (owner rule: charge from what
// arrived). A client-error status is a certain refusal; 408, 5xx and a lost connection are
// provider failures, marked so the zero-cost failure watch counts them. A refusal of the key itself
// (401, 403) also says so, which is what lets a platform-key call move to the next key.
test.each([
  [401, "byok", "byok_invalid", true, "invalid_key"],
  [403, "byok", "byok_invalid", true, "no_permission"],
  [401, "credits", "provider_unavailable", true, "invalid_key"],
  [402, "byok", "provider_unavailable", true, null],
  [404, "byok", "model_unavailable", true, null],
  [429, "byok", "provider_rate_limited", true, null],
  [408, "byok", "provider_unavailable", false, null],
  [500, "byok", "provider_unavailable", false, null],
  [503, "credits", "provider_unavailable", false, null],
] as const)(
  "HTTP %i with %s funding maps to %s without a retry",
  async (status, funding, code, refusal, keyRejection) => {
    const model = failing(callError(status));
    expect(await collect(request("openai", { funding }))).toEqual(
      refusal
        ? [{ type: "error", code, rejected: true, ...(keyRejection ? { keyRejection } : {}) }]
        : [{ type: "error", code, rejected: true, providerFailure: true }],
    );
    expect(model.doStreamCalls).toHaveLength(1);
  },
);

test("an OpenAI quota 429 is a key refusal; a plain rate limit is not", async () => {
  failing(callError(429, JSON.stringify({ error: { code: "insufficient_quota" } })));
  expect(await collect(request("openai", { funding: "credits" }))).toEqual([
    {
      type: "error",
      code: "provider_rate_limited",
      rejected: true,
      keyRejection: "quota_exhausted",
    },
  ]);
  failing(callError(429, JSON.stringify({ error: { code: "rate_limit_exceeded" } })));
  expect(await collect(request("openai", { funding: "credits" }))).toEqual([
    { type: "error", code: "provider_rate_limited", rejected: true },
  ]);
});

test("a timeout before any response is never a key refusal", async () => {
  const model = new MockLanguageModelV4({
    doStream: async (options) =>
      new Promise((_, reject) =>
        options.abortSignal?.addEventListener("abort", () => reject(callError(401))),
      ),
  });
  models.current = model;
  const events = await collect(request("openai", { funding: "credits", timeoutMs: 5 }));
  expect(events.at(-1)).toEqual({ type: "error", code: "timeout" });
  expect(events.some((event) => "keyRejection" in event)).toBe(false);
});

test("a missing model reported as a 400 maps to model_unavailable", async () => {
  failing(callError(400, JSON.stringify({ error: { code: "model_not_found" } })));
  expect(await collect(request("openai"))).toEqual([
    { type: "error", code: "model_unavailable", rejected: true },
  ]);
  failing(callError(400, "{}"));
  expect(await collect(request("openai"))).toEqual([
    { type: "error", code: "provider_unavailable", rejected: true },
  ]);
});

test("a network failure before a response is a zero-cost provider failure", async () => {
  failing(new TypeError("fetch failed"));
  expect(await collect(request("anthropic"))).toEqual([
    { type: "error", code: "provider_unavailable", rejected: true, providerFailure: true },
  ]);
});

test("our own Stop before any response is not a provider failure and stays charged", async () => {
  const controller = new AbortController();
  const model = new MockLanguageModelV4({
    doStream: async () => {
      controller.abort();
      throw new DOMException("aborted", "AbortError");
    },
  });
  models.current = model;
  const events = await collect(request("openai", { signal: controller.signal }));
  expect(events[0]).toMatchObject({ type: "stopped" });
  expect(events.at(-1)).toEqual({ type: "error", code: "cancelled" });
});

/** Captures the wire request a real SDK provider sends, without any network access. */
async function wireBody(provider: "openai" | "anthropic" | "openrouter", effort: "max" | "xhigh") {
  const fetch = vi.fn(async () => new Response("{}", { status: 418 }));
  vi.stubGlobal("fetch", fetch);
  const model = { openai: "gpt-5.6", anthropic: "claude-opus-5-5", openrouter: "openai/gpt-5.6" };
  const base = request(provider, { effort, model: model[provider] });
  expect(await collect(base)).toEqual([
    { type: "error", code: "provider_unavailable", rejected: true },
  ]);
  expect(fetch).toHaveBeenCalledOnce();
  const [url, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
  return { url, body: JSON.parse(String(init.body)) as Record<string, unknown> };
}

test("efforts never raise the output cap the credits reservation is based on", async () => {
  // Official hosts are pinned: base URL overrides in the environment are ignored.
  vi.stubEnv("OPENAI_BASE_URL", "https://attacker.test/v1");
  vi.stubEnv("ANTHROPIC_BASE_URL", "https://attacker.test");
  const anthropic = await wireBody("anthropic", "max");
  expect(anthropic.url).toBe("https://api.anthropic.com/v1/messages");
  expect(anthropic.body.max_tokens).toBe(64);
  expect(anthropic.body.output_config).toEqual({ effort: "max" });
  expect(anthropic.body.thinking).toBeUndefined();
  const openai = await wireBody("openai", "max");
  expect(openai.url).toBe("https://api.openai.com/v1/responses");
  expect(openai.body).toMatchObject({
    max_output_tokens: 64,
    store: false,
    reasoning: { effort: "max" },
  });
  const openrouter = await wireBody("openrouter", "xhigh");
  expect(openrouter.url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(openrouter.body).toMatchObject({ max_tokens: 64, reasoning: { effort: "xhigh" } });
});
