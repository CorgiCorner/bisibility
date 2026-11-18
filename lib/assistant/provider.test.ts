import type { LanguageModelV4 } from "@ai-sdk/provider";
import type { MockLanguageModelV4 } from "ai/test";
import { beforeEach, expect, test, vi } from "vitest";
import { streamAssistantProvider } from "./provider";
import {
  collectProviderEvents as collect,
  finishPart,
  providerRequest as request,
  sdkUsage,
  streamingModel,
} from "./provider.test-support";

const models = vi.hoisted(() => ({ current: null as LanguageModelV4 | null }));
vi.mock("./provider-models", async (importActual) => ({
  ...(await importActual<typeof import("./provider-models")>()),
  assistantLanguageModel: () => models.current,
}));

beforeEach(() => {
  vi.unstubAllEnvs();
  models.current = null;
});

const openAiUsage = sdkUsage(
  { total: 10, noCache: 6, cacheRead: 4 },
  { total: 3, text: 2, reasoning: 1 },
);
const mock = () => models.current as MockLanguageModelV4;

test("streams text, tool calls, inclusive usage and the response id once", async () => {
  models.current = streamingModel(
    [
      { type: "stream-start", warnings: [] },
      { type: "response-metadata", id: "resp_1" },
      { type: "text-delta", id: "t", delta: "Hel" },
      { type: "text-delta", id: "t", delta: "lo" },
      { type: "tool-call", toolCallId: "call", toolName: "read", input: '{"a":1}' },
      { type: "tool-call", toolCallId: "empty", toolName: "read", input: "" },
      finishPart(openAiUsage, "tool-calls"),
    ],
    { "x-request-id": "header-id" },
  );
  const tools = [
    { type: "function" as const, name: "read", inputSchema: { type: "object" as const } },
  ];
  const base = request("openai");
  const events = await collect({ ...base, effort: "high", body: { ...base.body, tools } });
  expect(events).toEqual([
    { type: "text-delta", text: "Hel" },
    { type: "text-delta", text: "lo" },
    { type: "tool-call", id: "call", name: "read", argumentsJson: '{"a":1}' },
    { type: "tool-call", id: "empty", name: "read", argumentsJson: "{}" },
    {
      type: "usage",
      usage: {
        inputTokens: 10,
        cachedInputTokens: 4,
        cacheWriteTokens: 0,
        outputTokens: 3,
        reasoningTokens: 1,
      },
      requestId: "resp_1",
    },
    { type: "finish", reason: "tool-calls" },
  ]);
  expect(mock().doStreamCalls).toHaveLength(1);
  expect(mock().doStreamCalls[0]).toMatchObject({
    maxOutputTokens: 64,
    tools,
    providerOptions: { openai: { store: false, reasoningEffort: "high" } },
  });
});

test("Anthropic usage keeps uncached, cached and written input apart", async () => {
  models.current = streamingModel(
    [
      finishPart(
        sdkUsage(
          { total: 16, noCache: 10, cacheRead: 4, cacheWrite: 2 },
          { total: 5, reasoning: 2 },
        ),
      ),
    ],
    { "request-id": "req-anthropic" },
  );
  const events = await collect(request("anthropic", { effort: "max" }));
  expect(events).toContainEqual({
    type: "usage",
    usage: {
      inputTokens: 10,
      cachedInputTokens: 4,
      cacheWriteTokens: 2,
      outputTokens: 5,
      reasoningTokens: 2,
    },
    requestId: "req-anthropic",
  });
  expect(mock().doStreamCalls[0].providerOptions).toEqual({ anthropic: { effort: "max" } });
});

test("OpenRouter keeps the reported cost as evidence and sends reasoning effort", async () => {
  models.current = streamingModel([
    { type: "response-metadata", id: "gen-1" },
    finishPart(sdkUsage({ total: 3, cacheRead: 1 }, { total: 2, reasoning: 0 }), "stop", {
      openrouter: { usage: { cost: 0.0042 } },
    }),
  ]);
  const events = await collect(request("openrouter", { effort: "low" }));
  expect(events).toContainEqual(
    expect.objectContaining({ type: "usage", requestId: "gen-1", providerReportedCostUsd: 0.0042 }),
  );
  expect(mock().doStreamCalls[0].providerOptions).toEqual({
    openrouter: { reasoning: { effort: "low" } },
  });
});

test("a model without reasoning sends no effort", async () => {
  models.current = streamingModel([finishPart(openAiUsage)]);
  await collect(request("anthropic"));
  expect(mock().doStreamCalls[0].providerOptions).toEqual({});
});

test.each([
  ["no totals", [finishPart(sdkUsage({}, {}))]],
  ["no input total", [finishPart(sdkUsage({}, { total: 1 }))]],
  ["no finish part", [{ type: "text-delta" as const, id: "t", delta: "x" }]],
  ["an interrupted stream", [finishPart(openAiUsage, "interrupted")]],
  ["a stream error", [{ type: "error" as const, error: new Error("x") }, finishPart(openAiUsage)]],
  ["reasoning above output", [finishPart(sdkUsage({ total: 1 }, { total: 1, reasoning: 2 }))]],
  ["cached above input", [finishPart(sdkUsage({ total: 1, cacheRead: 2 }, { total: 1 }))]],
  [
    "a malformed provider cost",
    [finishPart(openAiUsage, "stop", { openrouter: { usage: { cost: -1 } } })],
  ],
])("a stream with %s becomes usage_unknown without usage", async (_, parts) => {
  models.current = streamingModel(parts);
  const events = await collect(request("openrouter"));
  expect(events.some((event) => event.type === "usage")).toBe(false);
  // A response came, so the attempt is charged from its stop evidence instead of left unknown.
  expect(events.at(-2)).toMatchObject({ type: "stopped", evidence: { reasoningWindowMs: 0 } });
  expect(events.at(-1)).toEqual({ type: "error", code: "usage_unknown" });
});

test("a cut records tool-call input and the window hidden reasoning could fill", async () => {
  const controller = new AbortController();
  models.current = streamingModel(
    [
      { type: "tool-input-start", id: "c", toolName: "lookup" },
      { type: "tool-input-delta", id: "c", delta: '{"query":"seo"}' },
      { type: "tool-call", toolCallId: "c", toolName: "lookup", input: '{"query":"seo"}' },
      { type: "tool-call", toolCallId: "d", toolName: "lookup", input: "{}" },
    ],
    {},
    false,
  );
  const events = [];
  for await (const event of streamAssistantProvider(
    request("openai", { signal: controller.signal, effort: "medium" }),
  )) {
    events.push(event);
    if (events.filter((item) => item.type === "tool-call").length === 2) controller.abort();
  }
  // 8 letters at 2.5 per token and 7 other bytes at one each, then "{}" for the second call.
  expect(events.at(-2)).toMatchObject({
    type: "stopped",
    evidence: { toolTokens: 13, reasoningTokens: 0, reasoningSeen: false },
  });
  const window = (events.at(-2) as { evidence: { reasoningWindowMs: number } }).evidence;
  expect(window.reasoningWindowMs).toBeGreaterThanOrEqual(0);
  expect(window.reasoningWindowMs).toBeLessThan(1000);
});

test("Anthropic usage that does not add up is rejected", async () => {
  models.current = streamingModel([
    finishPart(sdkUsage({ total: 9, noCache: 1, cacheRead: 1, cacheWrite: 1 }, { total: 1 })),
  ]);
  expect((await collect(request("anthropic"))).at(-1)).toEqual({
    type: "error",
    code: "usage_unknown",
  });
});

test("an already aborted request never contacts the model", async () => {
  models.current = streamingModel([finishPart(openAiUsage)]);
  const controller = new AbortController();
  controller.abort();
  // Nothing was sent, so it is a certain zero, never a stopped answer to charge.
  expect(await collect(request("openai", { signal: controller.signal }))).toEqual([
    { type: "error", code: "cancelled", rejected: true },
  ]);
  expect(mock().doStreamCalls).toHaveLength(0);
});

test("stop and timeout end an open stream with their own codes", async () => {
  const controller = new AbortController();
  models.current = streamingModel([{ type: "text-delta", id: "t", delta: "x" }], {}, false);
  const events = [];
  for await (const event of streamAssistantProvider(
    request("openai", { signal: controller.signal }),
  )) {
    events.push(event);
    if (event.type === "text-delta") controller.abort();
  }
  expect(events.at(-1)).toEqual({ type: "error", code: "cancelled" });
  models.current = streamingModel([{ type: "text-delta", id: "t", delta: "x" }], {}, false);
  expect((await collect(request("openai", { timeoutMs: 5 }))).at(-1)).toEqual({
    type: "error",
    code: "timeout",
  });
});

test("usage received before a stop is retained", async () => {
  const controller = new AbortController();
  models.current = streamingModel([finishPart(openAiUsage)], { "x-request-id": "kept" }, false);
  setTimeout(() => controller.abort(), 20);
  const events = await collect(request("openai", { signal: controller.signal }));
  expect(events).toEqual([
    expect.objectContaining({ type: "usage", requestId: "kept" }),
    { type: "error", code: "cancelled" },
  ]);
});

test("a stop mid-stream reports what the delayed charge needs", async () => {
  const controller = new AbortController();
  models.current = streamingModel(
    [
      {
        type: "raw",
        rawValue: {
          type: "message_start",
          message: {
            usage: {
              input_tokens: 12,
              cache_read_input_tokens: 30,
              cache_creation_input_tokens: 4,
            },
          },
        },
      },
      { type: "response-metadata", id: "msg-1" },
      { type: "reasoning-start", id: "r" },
      { type: "reasoning-delta", id: "r", delta: "think" },
      { type: "text-delta", id: "t", delta: "x" },
    ],
    {},
    false,
  );
  const events = [];
  for await (const event of streamAssistantProvider(
    request("anthropic", { signal: controller.signal }),
  )) {
    events.push(event);
    if (event.type === "text-delta") controller.abort();
  }
  expect(events.slice(-2)).toEqual([
    {
      type: "stopped",
      evidence: {
        generationId: "msg-1",
        promptUsage: { input: 12, cacheRead: 30, cacheWrite: 4 },
        reasoningBytes: 5,
        reasoningSeen: true,
        reasoningTokens: 2,
        toolTokens: 0,
        reasoningWindowMs: expect.any(Number),
      },
    },
    { type: "error", code: "cancelled" },
  ]);
  expect(mock().doStreamCalls[0]?.includeRawChunks).toBe(true);
});
