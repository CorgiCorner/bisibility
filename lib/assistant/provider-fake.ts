import { randomUUID } from "node:crypto";
import "server-only";
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { simulateReadableStream } from "ai";
import { MockLanguageModelV4 } from "ai/test";

/**
 * Local deterministic fixture on the AI SDK mock model, so the real provider path consumes it.
 * It cannot perform HTTP and still produces a metered receipt with a unique request id.
 */
export function assistantFakeModel(delayMs: number): LanguageModelV4 {
  return new MockLanguageModelV4({
    provider: "development-fixture",
    modelId: "fixture",
    doStream: async (options) => ({
      stream: simulateReadableStream({
        chunks: assistantFakeParts(options),
        initialDelayInMs: delayMs || null,
        chunkDelayInMs: delayMs || null,
      }),
    }),
  });
}

export function assistantFakeParts(
  options: LanguageModelV4CallOptions,
): LanguageModelV4StreamPart[] {
  const text: string[] = [];
  let toolResult = false;
  let denied = false;
  for (const message of options.prompt) {
    if (message.role === "tool") {
      for (const part of message.content) {
        if (part.type !== "tool-result") continue;
        toolResult = true;
        if (part.output.type === "text" && part.output.value.includes('"denied":true'))
          denied = true;
      }
    }
    if (message.role !== "user") continue;
    for (const part of message.content) if (part.type === "text") text.push(part.text);
  }
  const userText = text.at(-1) ?? "";
  const parts: LanguageModelV4StreamPart[] = [
    { type: "stream-start", warnings: [] },
    { type: "response-metadata", id: `development-fixture-${randomUUID()}` },
    { type: "text-start", id: "text" },
  ];
  const markdown = [
    `# Project assistant\n\n${denied ? "The proposed action was denied." : "This is a local fixture response."}\n\n`,
    "- Review the project context\n- Confirm any action before it runs\n\n",
    "```text\nexample query\n```\n\n| Metric | Value |\n| --- | --- |\n| Example | 42 |\n\n",
    "[Example documentation](https://example.test/a/long/path/for/testing/assistant/rendering/and/wrapping?source=local-fixture&section=project-context)\n",
  ];
  for (const delta of markdown) parts.push({ type: "text-delta", id: "text", delta });
  parts.push({ type: "text-end", id: "text" });
  let called = false;
  if (!toolResult && options.tools?.length) {
    let name: string | null = null;
    let args: Record<string, unknown> = {};
    if (/research/i.test(userText)) {
      name = "research_keywords";
      args = { seed: "example", max_cost_cents: 100 };
    } else if (/\b(track|add)\b/i.test(userText)) {
      name = "add_keywords";
      args = { keywords: ["example keyword"] };
    } else if (/keyword|ranking|rankings/i.test(userText)) name = "get_project";
    if (name) {
      called = true;
      parts.push({
        type: "tool-call",
        toolCallId: "dev-fixture-call",
        toolName: name,
        input: JSON.stringify(args),
      });
    }
  }
  const limit = options.maxOutputTokens;
  const outputTokens =
    typeof limit === "number" && Number.isSafeInteger(limit) ? Math.max(0, Math.min(10, limit)) : 1;
  parts.push({
    type: "finish",
    finishReason: { unified: called ? "tool-calls" : "stop", raw: called ? "tool_calls" : "stop" },
    usage: {
      inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: outputTokens, text: outputTokens, reasoning: 0 },
    },
  });
  return parts;
}
