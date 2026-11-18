import { expect, test } from "vitest";
import { estimateAssistantCost } from "./pricing";
import {
  estimateTextTokens,
  type StoppedCall,
  stoppedCallMicroUsd,
  stoppedUsage,
  streamedFloorMicroUsd,
} from "./stop-estimate";

const pricing = {
  version: "v",
  inputMicroUsdPerMTok: 1_000_000,
  cachedInputMicroUsdPerMTok: 100_000,
  cacheWriteMicroUsdPerMTok: 1_250_000,
  outputMicroUsdPerMTok: 4_000_000,
};
const none = { generationId: null, promptUsage: null, reasoningBytes: 0, reasoningSeen: false };
const call = (patch: Partial<StoppedCall> = {}): StoppedCall => ({
  provider: "openai",
  promptBytes: 4000,
  textBytes: 300,
  maxOutputTokens: 1024,
  reasoning: false,
  evidence: none,
  ...patch,
});
const reserve = (item: StoppedCall) =>
  estimateAssistantCost(
    pricing,
    item.promptBytes,
    item.maxOutputTokens,
    item.provider === "anthropic",
  );

test("a stop is charged its prompt estimate plus every streamed byte as output", () => {
  expect(stoppedUsage(call())).toEqual({
    inputTokens: 1000,
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 300,
    reasoningTokens: 0,
  });
  // 1000 input at 1 USD/MTok and 300 output at 4 USD/MTok.
  expect(stoppedCallMicroUsd(call(), pricing, reserve(call()))).toBe(2200n);
});

test("the estimate is never below the streamed answer and never above the reservation", () => {
  for (const textBytes of [0, 1, 500, 1024, 5000]) {
    for (const reasoning of [false, true]) {
      const item = call({ textBytes, reasoning });
      const reserved = reserve(item);
      const micro = stoppedCallMicroUsd(item, pricing, reserved);
      expect(micro).toBeGreaterThanOrEqual(streamedFloorMicroUsd(item, pricing));
      expect(micro).toBeLessThanOrEqual(reserved);
    }
  }
  // A reservation smaller than the estimate caps it.
  expect(stoppedCallMicroUsd(call(), pricing, 5n)).toBe(5n);
  // A streamed answer is never charged as nothing, even with a cheap prompt.
  expect(stoppedCallMicroUsd(call({ promptBytes: 0 }), pricing, 10_000n)).toBe(1200n);
});

test("a row stored without a reasoning window keeps the output cap as its hidden bound", () => {
  const hidden = stoppedUsage(call({ reasoning: true, maxOutputTokens: 4096 }));
  expect(hidden).toMatchObject({ outputTokens: 4096, reasoningTokens: 3796 });
  const lower = stoppedUsage(call({ reasoning: true, maxOutputTokens: 1024 }));
  expect(lower).toMatchObject({ outputTokens: 1024, reasoningTokens: 724 });
  // Streamed reasoning text is counted as it came, with no hidden remainder.
  const seen = stoppedUsage(
    call({ reasoning: true, evidence: { ...none, reasoningBytes: 200, reasoningSeen: true } }),
  );
  expect(seen).toMatchObject({ outputTokens: 500, reasoningTokens: 200 });
  // Without a reasoning effort nothing hidden is assumed.
  expect(stoppedUsage(call({ maxOutputTokens: 4096 })).outputTokens).toBe(300);
});

test("a lower token limit lowers the charge of a stopped reasoning answer", () => {
  const high = call({ reasoning: true, maxOutputTokens: 16384 });
  const low = call({ reasoning: true, maxOutputTokens: 1024 });
  expect(stoppedCallMicroUsd(low, pricing, reserve(low))).toBeLessThan(
    stoppedCallMicroUsd(high, pricing, reserve(high)),
  );
});

test("Anthropic input comes from message_start usage when it arrived", () => {
  const measured = call({
    provider: "anthropic",
    evidence: { ...none, promptUsage: { input: 10, cacheRead: 900, cacheWrite: 50 } },
  });
  expect(stoppedUsage(measured)).toMatchObject({
    inputTokens: 10,
    cachedInputTokens: 900,
    cacheWriteTokens: 50,
  });
});

test("streamed text is charged at its token estimate, not one token per byte", () => {
  const english = "The quick brown fox jumps over the lazy dog. ".repeat(90);
  const bytes = Buffer.byteLength(english, "utf8");
  const tokens = estimateTextTokens(english);
  // About 2.6 bytes per token: above the real ~4, far below one token per byte.
  expect(tokens).toBeLessThan(bytes / 2.4);
  expect(tokens).toBeGreaterThan(bytes / 4);
  const item = call({ textBytes: bytes, textTokens: tokens, promptTokens: 700 });
  expect(stoppedUsage(item)).toMatchObject({
    inputTokens: 700,
    outputTokens: Math.min(1024, tokens),
  });
  // Dense ASCII is one token per byte and CJK two per character; never above the byte count.
  expect(estimateTextTokens("0123456789abcdef!?")).toBe(12 + 3);
  expect(estimateTextTokens("日本語のテキスト")).toBe(16);
  expect(estimateTextTokens("x")).toBe(1);
  expect(estimateTextTokens("")).toBe(0);
  for (const text of ["a", "  ", "é", "日", "😀", "a1"])
    expect(estimateTextTokens(text)).toBeLessThanOrEqual(Buffer.byteLength(text, "utf8"));
});

test("hidden reasoning is bounded by the time before visible output, not the cap", () => {
  const window = (reasoningWindowMs: number, provider: StoppedCall["provider"] = "openai") =>
    call({
      provider,
      reasoning: true,
      maxOutputTokens: 64_000,
      textBytes: 0,
      textTokens: 0,
      evidence: { ...none, reasoningWindowMs, reasoningTokens: 0, toolTokens: 0 },
    });
  // A stop before any response: nothing hidden was generated.
  expect(stoppedUsage(window(0)).outputTokens).toBe(0);
  // 400 ms at the OpenAI ceiling of 500 tokens per second.
  expect(stoppedUsage(window(400))).toMatchObject({ outputTokens: 200, reasoningTokens: 200 });
  expect(stoppedUsage(window(400, "openrouter")).outputTokens).toBe(1200);
  // Anthropic gets no thinking configuration, so nothing hidden is assumed.
  expect(stoppedUsage(window(5000, "anthropic")).outputTokens).toBe(0);
  // A very long window is still capped by the step's output limit.
  expect(stoppedUsage(window(10_000_000)).outputTokens).toBe(64_000);
  const reserved = reserve(window(400));
  expect(stoppedCallMicroUsd(window(400), pricing, reserved)).toBeLessThan(reserved / 10n);
});

test("streamed tool-call input counts as output", () => {
  const item = call({ textTokens: 0, evidence: { ...none, toolTokens: 40 } });
  expect(stoppedUsage(item).outputTokens).toBe(40);
});
