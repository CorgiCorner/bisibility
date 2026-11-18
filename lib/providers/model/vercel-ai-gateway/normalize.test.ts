import { MODEL_PLAYGROUND_LIMITS } from "@/lib/model-playground/schema";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { ModelTransportError } from "@/lib/providers/model/errors";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import error from "./__fixtures__/error.json";
import routed from "./__fixtures__/routed.json";
import text from "./__fixtures__/text.json";
import { key, request } from "./adapter.test-support";
import { textModelId } from "./catalog";
import { normalizeResponse } from "./normalize";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(() => {
      throw new Error("Unexpected network");
    }),
  );
});
afterEach(() => {
  expect(fetch).not.toHaveBeenCalled();
  vi.unstubAllGlobals();
});

function normalize(body: unknown = text) {
  const normalized = normalizeResponse({ body, requestId: null }, textModelId, key);
  expect(
    modelColumnResultSchema.safeParse({
      ...transportEvidence(request().column, Date.now(), null),
      ...normalized,
    }).success,
  ).toBe(true);
  return normalized;
}

describe("gateway response evidence", () => {
  it("retains ordinary text and partial token evidence without inventing money", () => {
    const result = normalize();
    expect(result).toMatchObject({
      state: "completed",
      answer: text.choices[0].message.content,
      actualProviderId: null,
      actualModelId: textModelId,
    });
    expect(result.usage).toMatchObject({
      completeness: "partial",
      inputTokens: 15,
      outputTokens: 28,
      reasoningTokens: null,
      cacheReadInputTokens: null,
      cacheWriteInputTokens: null,
      inputCacheAccounting: "unknown",
      searchCalls: null,
    });
    expect(result.providerCost).toEqual({
      amount: null,
      certainty: "unknown",
      basis: "unknown",
      currency: "USD",
      rateCardVersion: null,
    });
  });

  it("preserves subset counts without adding them to totals and exact reported subtotal", () => {
    const result = normalize(routed);
    expect(result.actualProviderId).toBe("bedrock");
    expect(result.usage).toMatchObject({
      inputTokens: 100,
      outputTokens: 40,
      reasoningTokens: 12,
      cacheReadInputTokens: 30,
      cacheWriteInputTokens: 10,
      cacheWrites: [],
      inputCacheAccounting: "unknown",
      completeness: "partial",
    });
    expect(result.providerCost.amount).toBe("0.00454050000000000001");
    expect(JSON.stringify(result)).not.toContain("marketCost");
  });

  it.each([
    null,
    undefined,
    {},
    { prompt_tokens: null },
    { prompt_tokens: -1, completion_tokens: 1.5 },
    { prompt_tokens: Number.MAX_SAFE_INTEGER + 1 },
  ])("preserves absent or invalid quantities as unknown: %j", (usage) => {
    expect(normalize({ ...text, usage }).usage).toMatchObject({
      completeness: "unknown",
      inputTokens: null,
      outputTokens: null,
    });
  });

  it("preserves individually valid partial quantities, explicit zero and unknown cache accounting", () => {
    expect(normalize({ ...text, usage: { prompt_tokens: 0 } }).usage).toMatchObject({
      completeness: "partial",
      inputTokens: 0,
      outputTokens: null,
    });
    expect(
      normalize({
        ...text,
        usage: {
          prompt_tokens: 1,
          completion_tokens: 2,
          prompt_tokens_details: { cached_tokens: 4 },
          completion_tokens_details: { reasoning_tokens: 3 },
        },
      }).usage,
    ).toMatchObject({
      cacheReadInputTokens: 4,
      reasoningTokens: null,
      inputCacheAccounting: "unknown",
      completeness: "partial",
    });
  });

  it.each([0, 0.0045, "-1", "1e-6", "NaN", "", null, undefined, "0".repeat(2049)])(
    "never infers cost from invalid gateway money or vendor rates: %j",
    (cost) => {
      const body = structuredClone(routed);
      const control = normalize(body);
      expect(control.costEvidence?.providerReported?.money.amount).toBe("0.00454050000000000001");
      Object.assign(body.choices[0].message.provider_metadata.gateway, {
        cost,
        marketCost: "123",
        totalCost: "456",
      });
      const result = normalize(body);
      expect(result.providerCost).toMatchObject({ amount: null, certainty: "unknown" });
      expect(result.costEvidence?.providerReported).toBeNull();
    },
  );

  it("preserves an explicit decimal zero as a reported subtotal only", () => {
    const body = structuredClone(routed);
    body.choices[0].message.provider_metadata.gateway.cost = "0";
    expect(normalize(body).providerCost).toMatchObject({
      amount: "0",
      certainty: "reported",
      basis: "provider_response",
    });
  });

  it("does not replace an actual model with the requested model", () => {
    expect(normalize({ ...text, model: "anthropic/claude-opus-5" })).toMatchObject({
      actualModelId: "anthropic/claude-opus-5",
      state: "partial",
      failure: "unsupported_model",
    });
    expect(normalize({ ...text, model: undefined })).toMatchObject({
      actualModelId: null,
      state: "partial",
      failure: "invalid_response",
    });
  });

  it("detects routing-model mismatch and never infers final provider from model creator or preference", () => {
    const body = structuredClone(routed);
    body.choices[0].message.provider_metadata.gateway.routing.canonicalSlug =
      "anthropic/claude-opus-5";
    expect(normalize(body)).toMatchObject({ state: "partial", failure: "unsupported_model" });
    Object.assign(body.choices[0].message.provider_metadata.gateway.routing, {
      finalProvider: undefined,
      resolvedProvider: "anthropic",
    });
    expect(normalize(body).actualProviderId).toBeNull();
  });

  it("rejects drift hidden in successful model attempts and strips unsafe provider identity", () => {
    const body = structuredClone(routed);
    body.choices[0].message.provider_metadata.gateway.routing.modelAttempts[0].canonicalSlug =
      "anthropic/claude-opus-5";
    expect(normalize(body)).toMatchObject({ state: "partial", failure: "unsupported_model" });
    body.choices[0].message.provider_metadata.gateway.routing.finalProvider = key;
    expect(normalize(body).actualProviderId).toBeNull();
    expect(JSON.stringify(normalize(body))).not.toContain(key);
  });

  it.each([
    error,
    { ...text, choices: [] },
    { ...text, choices: [...text.choices, ...text.choices] },
    { ...text, object: "chat.completion.chunk" },
    null,
  ])("rejects malformed envelopes and error wrappers safely", (body) => {
    expect(() => normalizeResponse({ body, requestId: null }, textModelId, key)).toThrow(
      ModelTransportError,
    );
  });

  it("handles refusal, provider truncation and unexpected client tools without executing tools", () => {
    expect(
      normalize({
        ...text,
        choices: [
          {
            index: 0,
            message: { role: "assistant", content: null, refusal: key },
            finish_reason: "stop",
          },
        ],
      }),
    ).toMatchObject({ state: "failed", failure: "refused", answer: null });
    expect(
      normalize({ ...text, choices: [{ ...text.choices[0], finish_reason: "length" }] }),
    ).toMatchObject({ state: "partial", truncation: { provider: true } });
    expect(
      normalize({
        ...text,
        choices: [
          {
            ...text.choices[0],
            message: {
              ...text.choices[0].message,
              tool_calls: [{ function: { name: "execute", arguments: key } }],
            },
            finish_reason: "tool_calls",
          },
        ],
      }),
    ).toMatchObject({ state: "partial", failure: "invalid_response" });
  });

  it("does not invent a tool count from unverified server metadata", () => {
    const body = structuredClone(routed);
    Object.assign(body.choices[0].message.provider_metadata.gateway, {
      gatewayToolCalls: { perplexity_search: 1 },
    });
    expect(normalize(body)).toMatchObject({
      state: "partial",
      failure: "invalid_response",
      usage: { searchCalls: null },
    });
  });

  it("rejects secret echoes and invalid Unicode, including beyond the retained answer bound", () => {
    for (const content of [
      key,
      encodeURIComponent(key),
      Buffer.from(key).toString("base64"),
      "\ud800",
      "x".repeat(25000) + key,
    ]) {
      expect(() =>
        normalize({
          ...text,
          choices: [{ ...text.choices[0], message: { role: "assistant", content } }],
        }),
      ).toThrow();
    }
  });

  it("retains the full bounded answer without splitting a Unicode code point", () => {
    const content = `${"a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes - 3)}😀more`;
    const result = normalize({
      ...text,
      choices: [{ ...text.choices[0], message: { role: "assistant", content } }],
    });
    expect(result.answer).toBe("a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes - 3));
    expect(result).toMatchObject({ state: "partial", truncation: { application: true } });
    const exact = "a".repeat(MODEL_PLAYGROUND_LIMITS.answerBytes);
    expect(
      normalize({
        ...text,
        choices: [{ ...text.choices[0], message: { role: "assistant", content: exact } }],
      }).answer,
    ).toBe(exact);
  });
});
