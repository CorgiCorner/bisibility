import type { LanguageModelV4 } from "@ai-sdk/provider";
import { afterEach, expect, test, vi } from "vitest";
import type { AssistantModel } from "./model-config";
import {
  collectProviderEvents as collect,
  finishPart,
  providerRequest as request,
  sdkUsage,
  streamingModel,
} from "./provider.test-support";
import { assistantPromptBody, type PromptItem } from "./provider-prompt";

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
});

/** A recorded Messages stream: an always-on thinking block, its signature, then a tool call. */
const recorded = [
  {
    type: "message_start",
    message: {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [],
      stop_reason: null,
      stop_sequence: null,
      usage: { input_tokens: 10, output_tokens: 1 },
    },
  },
  { type: "content_block_start", index: 0, content_block: { type: "thinking", thinking: "" } },
  { type: "content_block_delta", index: 0, delta: { type: "thinking_delta", thinking: "Plan." } },
  { type: "content_block_delta", index: 0, delta: { type: "signature_delta", signature: "sig-1" } },
  { type: "content_block_stop", index: 0 },
  {
    type: "content_block_start",
    index: 1,
    content_block: { type: "tool_use", id: "toolu_1", name: "list_keywords", input: {} },
  },
  {
    type: "content_block_delta",
    index: 1,
    delta: { type: "input_json_delta", partial_json: '{"limit":2}' },
  },
  { type: "content_block_stop", index: 1 },
  {
    type: "message_delta",
    delta: { stop_reason: "tool_use", stop_sequence: null },
    usage: { output_tokens: 20 },
  },
  { type: "message_stop" },
];

function sse(events: unknown[]) {
  const body = events
    .map(
      (event) => `event: ${(event as { type: string }).type}\ndata: ${JSON.stringify(event)}\n\n`,
    )
    .join("");
  return new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } });
}

const model: AssistantModel = {
  id: "m",
  provider: "anthropic",
  providerModel: "claude-opus-5-5",
  label: "Test",
  toolUse: true,
  maxOutputTokens: 64,
  contextChars: 10000,
  pricing: {
    version: "v",
    inputMicroUsdPerMTok: 1,
    cachedInputMicroUsdPerMTok: 1,
    cacheWriteMicroUsdPerMTok: 1,
    outputMicroUsdPerMTok: 1,
  },
};

test.each(["claude-opus-5-5", "claude-haiku-5-5"])(
  "the next Anthropic step replays signed thinking for %s before its tool use",
  async (providerModel) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => sse(recorded)),
    );
    const base = request("anthropic", { model: providerModel, effort: "high" });
    const events = await collect(base);
    const reasoning = events.filter((event) => event.type === "reasoning");
    expect(reasoning).toEqual([
      { type: "reasoning", text: "Plan.", providerOptions: { anthropic: { signature: "sig-1" } } },
    ]);
    expect(events.find((event) => event.type === "tool-call")).toMatchObject({ id: "toolu_1" });

    const history: PromptItem[] = [
      { type: "user", text: "hi" },
      ...(reasoning as PromptItem[]),
      { type: "tool_call", id: "toolu_1", name: "list_keywords", argumentsJson: '{"limit":2}' },
      { type: "tool_result", id: "toolu_1", result: { rows: [] } },
    ];
    const fetch = vi.fn(async () => new Response("{}", { status: 418 }));
    vi.stubGlobal("fetch", fetch);
    await collect({ ...base, body: assistantPromptBody(model, "system", history, []) });
    const [, init] = fetch.mock.calls[0] as unknown as [string, RequestInit];
    const wire = JSON.parse(String(init.body)) as {
      messages: { role: string; content: unknown }[];
    };
    expect(wire.messages[1]).toEqual({
      role: "assistant",
      content: [
        { type: "thinking", thinking: "Plan.", signature: "sig-1" },
        { type: "tool_use", id: "toolu_1", name: "list_keywords", input: { limit: 2 } },
      ],
    });
  },
);

test("other providers keep no reasoning for replay", async () => {
  models.current = streamingModel([
    { type: "reasoning-start", id: "r", providerMetadata: { anthropic: { signature: "x" } } },
    { type: "reasoning-delta", id: "r", delta: "Plan." },
    { type: "reasoning-end", id: "r" },
    finishPart(sdkUsage({ total: 1, noCache: 1 }, { total: 1, text: 1 })),
  ]);
  const events = await collect(request("openai"));
  expect(events.some((event) => event.type === "reasoning")).toBe(false);
  expect(events.some((event) => event.type === "usage")).toBe(true);
});
