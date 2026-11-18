import { describe, expect, it } from "vitest";
import { parseAssistantModels } from "./model-config";
import { estimateAssistantCost, priceAssistantUsage } from "./pricing";

const pricing = {
  version: "v1",
  inputMicroUsdPerMTok: 1_000_000,
  cachedInputMicroUsdPerMTok: 100_000,
  cacheWriteMicroUsdPerMTok: 1_250_000,
  outputMicroUsdPerMTok: 2_000_000,
};
const model = {
  id: "configured",
  provider: "openai",
  providerModel: "native",
  label: "Model",
  toolUse: true,
  maxOutputTokens: 100,
  contextChars: 300,
  pricing,
};

describe("assistant pricing", () => {
  it("fails closed on missing, incomplete or duplicate model configuration", () => {
    expect(parseAssistantModels(undefined)).toBeNull();
    expect(parseAssistantModels("{")).toBeNull();
    expect(
      parseAssistantModels(JSON.stringify([{ ...model, pricing: { version: "v1" } }])),
    ).toBeNull();
    expect(parseAssistantModels(JSON.stringify([model, model]))).toBeNull();
    expect(parseAssistantModels(JSON.stringify([model]))).toHaveLength(1);
  });
  it("rounds up fractional micro dollars and bounds prompt tokens", () => {
    expect(
      estimateAssistantCost(
        { ...pricing, inputMicroUsdPerMTok: 1, outputMicroUsdPerMTok: 0 },
        1,
        0,
        false,
      ),
    ).toBe(1n);
    // 4 input bytes bound 4 tokens: 4 input + 5 cache write + 6 output micro-USD.
    expect(estimateAssistantCost(pricing, 4, 3, true)).toBe(15n);
  });
  it("bounds token-dense multilingual prompts by their UTF-8 bytes", () => {
    const prompt = "\u5e02\u5834\u8abf\u67fb"; // four CJK characters, three bytes each
    const bytes = new TextEncoder().encode(JSON.parse(`"${prompt}"`)).length;
    expect(bytes).toBe(12);
    expect(estimateAssistantCost({ ...pricing, outputMicroUsdPerMTok: 0 }, bytes, 0, false)).toBe(
      12n,
    );
  });
  it("does not count cached or reasoning tokens twice for inclusive input", () => {
    expect(
      priceAssistantUsage("openai", pricing, {
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheWriteTokens: 0,
        outputTokens: 10,
        reasoningTokens: 5,
      }),
    ).toBe(84n);
  });
  it("prices the third direct provider with inclusive input and ignores no reported cost", () => {
    expect(
      priceAssistantUsage("openrouter", pricing, {
        inputTokens: 100,
        cachedInputTokens: 40,
        cacheWriteTokens: 0,
        outputTokens: 10,
        reasoningTokens: 5,
      }),
    ).toBe(84n);
  });
  it("adds cache read and write to exclusive input", () => {
    expect(
      priceAssistantUsage("anthropic", pricing, {
        inputTokens: 60,
        cachedInputTokens: 40,
        cacheWriteTokens: 20,
        outputTokens: 10,
        reasoningTokens: 0,
      }),
    ).toBe(109n);
  });
  it("rejects inconsistent or nonintegral usage", () => {
    expect(() =>
      priceAssistantUsage("openai", pricing, {
        inputTokens: 1,
        cachedInputTokens: 2,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      }),
    ).toThrow();
    expect(() =>
      priceAssistantUsage("anthropic", pricing, {
        inputTokens: 0.5,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 0,
        reasoningTokens: 0,
      }),
    ).toThrow();
  });
});
