import type {
  LanguageModelV4FunctionTool,
  LanguageModelV4Prompt,
  SharedV4ProviderOptions,
} from "@ai-sdk/provider";
import type { AssistantEffort } from "./effort";
import type { KeyRejection } from "./key-rejection";
import type { AssistantUsage } from "./pricing";
import type { AssistantErrorCode, AssistantProvider, FundingMode } from "./wire";

export type ProviderEvent =
  | { type: "text-delta"; text: string }
  | { type: "tool-call"; id: string; name: string; argumentsJson: string }
  | {
      type: "usage";
      usage: AssistantUsage;
      requestId: string | null;
      /** Provider-reported USD, stored as evidence and never used as the customer price. */
      providerReportedCostUsd?: number;
    }
  /** A signed reasoning block the provider requires back before the turn's tool calls. */
  | { type: "reasoning"; text: string; providerOptions: SharedV4ProviderOptions }
  | { type: "finish"; reason: string }
  /** A call cut before its receipt: what is known for the delayed charge of a stopped answer. */
  | { type: "stopped"; evidence: StopEvidence }
  /**
   * rejected: nothing arrived from the provider, so the call costs nothing. providerFailure: it
   * was a server error, 408 or a lost connection rather than a certain refusal (a client-error
   * status); these are counted so a provider that bills for them is noticed. keyRejection: the
   * provider refused this key before running anything (set only with rejected, never after a
   * timeout, a stop or any response), so a platform-key call may move to the next key.
   */
  | {
      type: "error";
      code: AssistantErrorCode;
      rejected?: true;
      providerFailure?: true;
      keyRejection?: KeyRejection;
    };

/**
 * generationId: the provider's response id (OpenRouter looks the generation up by it).
 * promptUsage: Anthropic input usage from message_start, measured before any output.
 * reasoningBytes: UTF-8 bytes of streamed reasoning text; reasoningSeen is false when none came.
 * reasoningTokens, toolTokens: token estimates of streamed reasoning and tool-call input text.
 * reasoningWindowMs: from the provider's response to the first visible output or the cut (0 when
 * no response came), the only time hidden reasoning could have been generated in.
 * The optional fields are absent on rows stored before they were recorded.
 */
export type StopEvidence = {
  generationId: string | null;
  promptUsage: { input: number; cacheRead: number; cacheWrite: number } | null;
  reasoningBytes: number;
  reasoningSeen: boolean;
  reasoningTokens?: number;
  toolTokens?: number;
  reasoningWindowMs?: number;
};

/** Provider-neutral request for one model call. Its JSON size bounds the prompt tokens. */
export type AssistantPromptBody = {
  prompt: LanguageModelV4Prompt;
  tools: LanguageModelV4FunctionTool[];
  /** Hard output cap for the call. Reasoning tokens are billed as output inside it. */
  maxOutputTokens: number;
};

export type ProviderRequest = {
  provider: AssistantProvider;
  model: string;
  apiKey: string;
  funding: FundingMode;
  body: AssistantPromptBody;
  effort: AssistantEffort | null;
  signal: AbortSignal;
  timeoutMs: number;
};

export function statusError(status: number, funding: FundingMode): AssistantErrorCode {
  if (status === 401 || status === 403)
    return funding === "byok" ? "byok_invalid" : "provider_unavailable";
  if (status === 402) return "provider_unavailable";
  if (status === 429) return "provider_rate_limited";
  if (status === 404) return "model_unavailable";
  return "provider_unavailable";
}

export function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}
