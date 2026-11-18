import type { AssistantStreamEvent, RunView } from "@/lib/assistant/wire";
import { describe, expect, it } from "vitest";
import { conversationReducer, conversationState } from "./conversation-store";
import { readAssistantStream } from "./stream";

const run: RunView = {
  id: "r",
  status: "streaming",
  modelId: "m",
  provider: "openai",
  funding: "byok",
  startedAt: "2026-01-01",
  finishedAt: null,
  error: null,
  usage: null,
  usageUncertain: false,
};

describe("assistant stream", () => {
  it("decodes split UTF-8 and lines, skips unknown events, and accepts a final line without newline", async () => {
    const bytes = new TextEncoder().encode(
      '{"seq":1,"type":"text.delta","messageId":"m","delta":"é"}\n{"seq":2,"type":"future"}\n{"seq":3,"type":"text.delta","messageId":"m","delta":"!"}',
    );
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        for (const byte of bytes) controller.enqueue(new Uint8Array([byte]));
        controller.close();
      },
    });
    const events: AssistantStreamEvent[] = [];
    await readAssistantStream(stream, (event) => events.push(event));
    expect(events.map((event) => event.seq)).toEqual([1, 3]);
    expect(events[0]).toMatchObject({ delta: "é" });
  });
  it("deduplicates and applies events in sequence order", () => {
    const started: AssistantStreamEvent = {
      seq: 1,
      type: "run.started",
      conversationId: "c",
      run,
      userMessage: null,
      assistantMessageId: "m",
    };
    const first: AssistantStreamEvent = {
      seq: 2,
      type: "text.delta",
      messageId: "m",
      delta: "hello",
    };
    const second: AssistantStreamEvent = {
      seq: 3,
      type: "text.delta",
      messageId: "m",
      delta: " world",
    };
    const state = [started, second, first, first].reduce(conversationReducer, conversationState());
    expect(state.events).toHaveLength(3);
    expect(state.conversation?.messages[0]?.parts).toEqual([{ type: "text", text: "hello world" }]);
  });
});
