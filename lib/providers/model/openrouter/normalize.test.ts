import { MODEL_PLAYGROUND_LIMITS, utf8Bytes } from "@/lib/model-playground/schema";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { transportEvidence } from "@/lib/providers/model/transport-evidence";
import { describe, expect, it } from "vitest";
import { normalizeOpenRouterResponse } from "./normalize";
import { canary, forbidNetwork, normal, request, web } from "./test-support";

forbidNetwork();
function normalize(body: unknown = normal(), search = false) {
  const result = normalizeOpenRouterResponse(body, search, canary);
  return modelColumnResultSchema.parse({
    ...transportEvidence(request().column, Date.now(), null),
    ...result,
  });
}

describe("native API evidence", () => {
  it("retains full answer, exact slash model, upstream identity and token subsets", () => {
    const result = normalize();
    expect(result).toMatchObject({
      state: "completed",
      failure: null,
      answer: "Synthetic answer.",
      actualModelId: "openai/gpt-5.2",
      actualProviderId: "OpenAI",
      paymentReceipt: null,
      usage: {
        completeness: "complete",
        inputTokens: 194,
        outputTokens: 20,
        reasoningTokens: 2,
        cacheReadInputTokens: 10,
        cacheWriteInputTokens: 0,
        inputCacheAccounting: "included",
      },
      providerCost: { amount: null, certainty: "unknown" },
    });
  });

  it("never substitutes unreported identities", () => {
    const body = normal() as Record<string, unknown>;
    delete body.provider;
    delete body.model;
    expect(normalize(body)).toMatchObject({
      state: "completed",
      failure: null,
      answer: "Synthetic answer.",
      actualProviderId: null,
      actualModelId: null,
    });
  });

  it.each([
    ["model", "example/other/model", "unsupported_model"],
    ["provider", "Azure", "provider_error"],
  ])("surfaces %s drift and retains the actual identity", (field, identity, failure) => {
    const body = { ...normal(), [field]: identity };
    const result = normalize(body);
    expect(result).toMatchObject({ state: "failed", failure });
    expect(field === "model" ? result.actualModelId : result.actualProviderId).toBe(identity);
    expect(result.column.modelId).toBe("openai/gpt-5.2");
  });

  it("retains explicitly selected upstream metadata, never an unselected candidate", () => {
    const body = normal() as Record<string, unknown>;
    delete body.provider;
    body.openrouter_metadata = {
      endpoints: { available: [{ provider: "Azure", selected: false }] },
    };
    expect(normalize(body).actualProviderId).toBeNull();
    body.openrouter_metadata = {
      endpoints: { available: [{ provider: "OpenAI", selected: true }] },
    };
    expect(normalize(body).actualProviderId).toBe("OpenAI");
  });

  it.each([
    ["conflicting labels", "Azure", "OpenAI"],
    ["unrepresentable top-level label", "Google AI Studio", undefined],
    ["unrepresentable selected label", undefined, "Google AI Studio"],
  ])("retains measured usage with null identity for %s", (_name, provider, selectedProvider) => {
    const result = normalize({
      ...normal(),
      provider,
      openrouter_metadata: {
        endpoints: { available: [{ provider: selectedProvider, selected: true }] },
      },
    });
    expect(result).toMatchObject({
      state: "failed",
      failure: "provider_error",
      actualModelId: "openai/gpt-5.2",
      actualProviderId: null,
      answer: null,
      citations: [],
      usage: { inputTokens: 194, outputTokens: 20, completeness: "complete" },
    });
  });

  it("surfaces reported retry/fallback attempts even when the final identity matches", () => {
    const result = normalize({ ...normal(), openrouter_metadata: { attempt: 2 } });
    expect(result).toMatchObject({
      state: "failed",
      failure: "provider_error",
      actualProviderId: "OpenAI",
      answer: null,
    });
  });

  it("keeps repeated occurrences and exact distinct source URLs without guessing UTF-16 offsets", () => {
    const result = normalize(web(), true);
    expect(result.citations).toHaveLength(3);
    expect(result.citations.map((citation) => citation.sourceId)).toEqual([
      "source_0",
      "source_0",
      "source_1",
    ]);
    expect(new Set(result.citations.map((citation) => citation.occurrenceId)).size).toBe(3);
    expect(
      result.citations.every((citation) => citation.start === null && citation.end === null),
    ).toBe(true);
    expect(result.usage).toMatchObject({
      completeness: "partial",
      searchCalls: null,
      searchContentTokens: null,
    });
  });

  it("bounds citation count and rejects credentialed/malformed URLs", () => {
    const body = web();
    const source = body.choices[0].message.annotations[0];
    Object.assign(body.choices[0].message, {
      annotations: [
        {
          ...source,
          url_citation: { ...source.url_citation, url: "https://user:pass@example.com" },
        },
        { ...source, url_citation: { ...source.url_citation, url: "javascript:alert(1)" } },
        ...Array.from({ length: 105 }, () => source),
      ],
    });
    const result = normalize(body, true);
    expect(result.citations).toHaveLength(100);
    expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
  });

  it.each(["\ud800", "unsafe\udfff title", "\ud800😀", "😀\udfff"])(
    "drops a malformed Unicode citation title and flags truncation: %j",
    (title) => {
      const body = web();
      body.choices[0].message.annotations[0].url_citation.title = title;
      const result = normalize(body, true);
      expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
      expect(result.citations[0]).toMatchObject({
        title: null,
        url: body.choices[0].message.annotations[0].url_citation.url,
      });
      expect(result.citations).toHaveLength(3);
    },
  );

  it("retains valid surrogate pairs in citation titles within the P01 limit", () => {
    const body = web();
    body.choices[0].message.annotations[0].url_citation.title = "😀".repeat(257);
    const result = normalize(body, true);
    expect(result.citations[0].title).toBe("😀".repeat(256));
    expect(result).toMatchObject({ state: "partial", truncation: { citations: true } });
  });

  it("retains the entire bounded answer and explicitly marks provider/application truncation", () => {
    const body = normal();
    body.choices[0].message.content = ` ${"😀".repeat(7000)} `;
    body.choices[0].finish_reason = "length";
    const result = normalize(body);
    expect(result).toMatchObject({
      state: "partial",
      truncation: { provider: true, application: true },
    });
    expect(utf8Bytes(result.answer ?? "")).toBeLessThanOrEqual(MODEL_PLAYGROUND_LIMITS.answerBytes);
    expect(body.choices[0].message.content.startsWith(result.answer ?? "")).toBe(true);
    expect(utf8Bytes(result.answer ?? "")).toBeGreaterThan(MODEL_PLAYGROUND_LIMITS.answerBytes - 4);
    body.choices[0].message.content = "  untrimmed answer\n";
    body.choices[0].finish_reason = "stop";
    expect(normalize(body).answer).toBe(body.choices[0].message.content);
  });

  it.each([
    null,
    {},
    { error: { message: canary } },
    { ...normal(), object: "chat.completion.chunk" },
    { ...normal(), choices: [] },
    { ...normal(), choices: [normal().choices[0], normal().choices[0]] },
    { ...normal(), choices: [{ message: { role: "assistant", content: "\ud800" } }] },
    { ...normal(), choices: [{ message: { role: "assistant", content: [{ type: "image" }] } }] },
    { ...normal(), model: canary },
    { ...normal(), provider: `${canary} unrepresentable label` },
    {
      ...normal(),
      openrouter_metadata: {
        endpoints: { available: [{ provider: `${canary} label`, selected: true }] },
      },
    },
    { ...normal(), choices: [{ message: { role: "assistant", content: canary } }] },
  ])("rejects malformed/streaming/echo evidence safely", (body) => {
    expect(() => normalize(body)).toThrow("invalid response");
    try {
      normalize(body);
    } catch (error) {
      expect(String(error)).not.toContain(canary);
    }
  });

  it.each(["tool_calls", "function_call"])("does not execute arbitrary %s", (field) => {
    const body = normal();
    Object.assign(body.choices[0].message, { [field]: [{ name: "unsafe", arguments: canary }] });
    expect(normalize(body)).toMatchObject({ state: "failed", failure: "invalid_response" });
    expect(JSON.stringify(normalize(body))).not.toContain(canary);
  });

  it("preserves measured usage when a provider refuses", () => {
    const body = normal();
    body.choices[0].finish_reason = "content_filter";
    expect(normalize(body)).toMatchObject({
      state: "failed",
      failure: "refused",
      usage: { inputTokens: 194 },
    });
  });
});

describe("failure body sanitization", () => {
  it("discards arbitrary provider failure content and headers", () => {
    const body = normal();
    body.choices[0].message.content = request().prompt;
    Object.assign(body.choices[0], {
      error: { message: request().prompt, headers: { authorization: canary } },
    });
    const result = normalize(body);
    expect(result).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      answer: null,
      citations: [],
    });
    expect(JSON.stringify(result)).not.toContain(request().prompt);
    expect(JSON.stringify(result)).not.toContain(canary);
  });
});

describe("untruncated citation credential checks", () => {
  it.each([0, 250, 255, 256, 300])("rejects a raw title echo at code point %i", (offset) => {
    const body = web();
    body.choices[0].message.annotations[0].url_citation.title = "😀".repeat(offset) + canary;
    const value = normalize(body, true);
    expect(value).toMatchObject({
      state: "failed",
      failure: "invalid_response",
      answer: null,
      citations: [],
      truncation: { citations: true },
      usage: { inputTokens: 120, outputTokens: 20 },
    });
    expect(JSON.stringify(value)).not.toContain(canary.slice(0, 6));
  });
});
