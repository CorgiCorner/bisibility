import { ASSISTANT_HIDDEN_REASONING_TOKENS_PER_SECOND } from "./limits";
import type { AssistantPricing } from "./model-config";
import { type AssistantUsage, priceAssistantUsage } from "./pricing";
import type { StopEvidence } from "./provider-types";
import type { AssistantProvider } from "./wire";

/** What a stopped call left behind, stored on the attempt until its delayed charge settles. */
export type StoppedCall = {
  provider: AssistantProvider;
  /** UTF-8 bytes of the prompt sent, the same figure the reservation used. */
  promptBytes: number;
  /** Estimated prompt tokens (estimateTextTokens of the request); absent on older rows. */
  promptTokens?: number;
  /** UTF-8 bytes of the answer text streamed to the user before the stop. */
  textBytes: number;
  /** Estimated tokens of that text, summed per streamed delta; absent on older rows. */
  textTokens?: number;
  /** The step's output cap: the request's own hard limit on billed output. */
  maxOutputTokens: number;
  /** The run used a reasoning effort, so hidden reasoning may have been billed. */
  reasoning: boolean;
  evidence: StopEvidence;
};

/** Older rows without a token estimate charge the prompt at about four bytes per token. */
const PROMPT_BYTES_PER_TOKEN = 4;

/**
 * Tokens of text without the model's tokenizer, leaning high: ASCII letters and whitespace at one
 * token per 2.5 bytes (English and code run about 4), other ASCII (digits, punctuation, base64 or
 * hex runs) at one token per byte, and two tokens per non-ASCII character. Never more than the
 * UTF-8 byte count, which bounds any byte-level BPE count, and at least one token for any text,
 * so a stream summed per delta counts at least one token per delta.
 */
export function estimateTextTokens(text: string): number {
  if (!text) return 0;
  let plain = 0;
  let dense = 0;
  let wide = 0;
  let bytes = 0;
  for (const char of text) {
    const code = char.codePointAt(0) ?? 0;
    if (code >= 0x80) {
      wide++;
      bytes += code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
      continue;
    }
    bytes++;
    const letter = (code | 0x20) >= 0x61 && (code | 0x20) <= 0x7a;
    if (letter || code === 0x20 || code === 0x09 || code === 0x0a || code === 0x0d) plain++;
    else dense++;
  }
  return Math.max(1, Math.min(bytes, Math.ceil(plain / 2.5) + dense + 2 * wide));
}

/**
 * Usage a stopped call is charged for when the provider gives no receipt:
 * - input: Anthropic's measured message_start usage, else the prompt's token estimate;
 * - output: the token estimate of the streamed answer, reasoning and tool-call text, plus, for a
 *   run with reasoning that streamed no reasoning text, hidden reasoning bounded by time (see
 *   ASSISTANT_HIDDEN_REASONING_TOKENS_PER_SECOND): none before any response, none for Anthropic;
 * - the output total never exceeds the step's output cap the provider enforced.
 */
export function stoppedUsage(call: StoppedCall): AssistantUsage {
  const cap = call.maxOutputTokens;
  const evidence = call.evidence;
  const reasoningSeen = evidence.reasoningTokens ?? evidence.reasoningBytes;
  const visible = (call.textTokens ?? call.textBytes) + reasoningSeen + (evidence.toolTokens ?? 0);
  const hidden = hiddenReasoningTokens(call, Math.max(0, cap - visible));
  const outputTokens = Math.min(cap, visible + hidden);
  const reasoningTokens = Math.min(outputTokens, reasoningSeen + hidden);
  const measured = evidence.promptUsage;
  if (measured && call.provider === "anthropic")
    return {
      inputTokens: measured.input,
      cachedInputTokens: measured.cacheRead,
      cacheWriteTokens: measured.cacheWrite,
      outputTokens,
      reasoningTokens,
    };
  return {
    inputTokens: call.promptTokens ?? Math.ceil(call.promptBytes / PROMPT_BYTES_PER_TOKEN),
    cachedInputTokens: 0,
    cacheWriteTokens: 0,
    outputTokens,
    reasoningTokens,
  };
}

function hiddenReasoningTokens(call: StoppedCall, room: number): number {
  const { evidence } = call;
  if (!call.reasoning || evidence.reasoningSeen || call.provider === "anthropic") return 0;
  // A row stored before the reasoning window was recorded keeps the cap as its bound.
  if (evidence.reasoningWindowMs === undefined) return room;
  const rate = ASSISTANT_HIDDEN_REASONING_TOKENS_PER_SECOND[call.provider];
  return Math.min(room, Math.ceil((Math.max(0, evidence.reasoningWindowMs) / 1000) * rate));
}

/**
 * Micro-USD for a stopped call: the estimate priced at the catalog rates, never below the price of
 * the visibly streamed answer text and never above the attempt's reservation.
 */
export function stoppedCallMicroUsd(
  call: StoppedCall,
  pricing: AssistantPricing,
  reservedMicroUsd: bigint,
): bigint {
  const estimate = priceAssistantUsage(call.provider, pricing, stoppedUsage(call));
  const streamed = streamedFloorMicroUsd(call, pricing);
  const bounded = estimate < streamed ? streamed : estimate;
  return bounded > reservedMicroUsd ? reservedMicroUsd : bounded;
}

/** The price of the answer text the user saw, at its token estimate (bytes on older rows). */
export function streamedFloorMicroUsd(call: StoppedCall, pricing: AssistantPricing): bigint {
  const tokens = BigInt(Math.min(call.maxOutputTokens, call.textTokens ?? call.textBytes));
  return (tokens * BigInt(pricing.outputMicroUsdPerMTok) + 999_999n) / 1_000_000n;
}

/** Stored attempt evidence back into a stopped call; null when it is not one. */
export function parseStoppedCall(value: unknown): StoppedCall | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const call = (value as { stopped?: unknown }).stopped;
  if (!call || typeof call !== "object") return null;
  const item = call as StoppedCall;
  const counts = [item.promptBytes, item.textBytes, item.maxOutputTokens];
  const optional = [item.promptTokens, item.textTokens].filter((count) => count !== undefined);
  if (![...counts, ...optional].every((count) => Number.isSafeInteger(count) && count >= 0))
    return null;
  const evidence = item.evidence as StopEvidence | undefined;
  if (!evidence || typeof evidence !== "object" || typeof item.reasoning !== "boolean") return null;
  if (!Number.isSafeInteger(evidence.reasoningBytes) || evidence.reasoningBytes < 0) return null;
  return item;
}
