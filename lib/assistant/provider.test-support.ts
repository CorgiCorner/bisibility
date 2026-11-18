import type { LanguageModelV4StreamPart, LanguageModelV4Usage } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { streamAssistantProvider } from "./provider";
import type { ProviderEvent, ProviderRequest } from "./provider-types";

/** Test-only helpers for the AI SDK provider path. */
export function sdkUsage(
  input: Partial<LanguageModelV4Usage["inputTokens"]>,
  output: Partial<LanguageModelV4Usage["outputTokens"]>,
): LanguageModelV4Usage {
  return {
    inputTokens: {
      total: undefined,
      noCache: undefined,
      cacheRead: undefined,
      cacheWrite: undefined,
      ...input,
    },
    outputTokens: { total: undefined, text: undefined, reasoning: undefined, ...output },
  };
}

export function finishPart(
  usage: LanguageModelV4Usage,
  unified: "stop" | "tool-calls" | "interrupted" | "error" = "stop",
  providerMetadata?: Extract<LanguageModelV4StreamPart, { type: "finish" }>["providerMetadata"],
): LanguageModelV4StreamPart {
  return {
    type: "finish",
    finishReason: { unified, raw: unified },
    usage,
    ...(providerMetadata ? { providerMetadata } : {}),
  };
}

export function streamingModel(
  parts: LanguageModelV4StreamPart[],
  headers: Record<string, string> = {},
  close = true,
) {
  return new MockLanguageModelV4({
    doStream: async () => ({
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          for (const part of parts) controller.enqueue(part);
          if (close) controller.close();
        },
      }),
      response: { headers },
    }),
  });
}

export function providerRequest(
  provider: ProviderRequest["provider"],
  overrides: Partial<ProviderRequest> = {},
): ProviderRequest {
  return {
    provider,
    model: "configured",
    apiKey: "fake",
    funding: "byok",
    body: {
      prompt: [{ role: "user", content: [{ type: "text", text: "hi" }] }],
      tools: [],
      maxOutputTokens: 64,
    },
    effort: null,
    signal: new AbortController().signal,
    timeoutMs: 1000,
    ...overrides,
  };
}

export async function collectProviderEvents(input: ProviderRequest) {
  const events: ProviderEvent[] = [];
  for await (const event of streamAssistantProvider(input)) events.push(event);
  return events;
}
