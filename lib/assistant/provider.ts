import "server-only";
import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4StreamPart,
} from "@ai-sdk/provider";
import { keyRejectionOf } from "./key-rejection";
import { assistantFakeModel } from "./provider-fake";
import { assistantDevFakeProvider, isAssistantFakeProviderEnabled } from "./provider-fake-env";
import { assistantLanguageModel, assistantProviderOptions } from "./provider-models";
import {
  object,
  type ProviderEvent,
  type ProviderRequest,
  type StopEvidence,
  statusError,
} from "./provider-types";
import { assistantUsageFromSdk, providerReportedCost } from "./provider-usage";
import { estimateTextTokens } from "./stop-estimate";
import type { AssistantErrorCode } from "./wire";

/**
 * One model call per engine step through the AI SDK model API. Tools are definitions only, so the
 * engine keeps its own loop and approvals; nothing retries or falls back to another model.
 */
export async function* streamAssistantProvider(
  request: ProviderRequest,
): AsyncGenerator<ProviderEvent> {
  const fake = assistantDevFakeProvider();
  if (fake.enabled && !isAssistantFakeProviderEnabled()) {
    yield { type: "error", code: "not_configured", rejected: true };
    return;
  }
  const model = fake.enabled ? assistantFakeModel(fake.delayMs) : assistantLanguageModel(request);
  yield* streamModel(model, request);
}

async function* streamModel(
  model: LanguageModelV4,
  request: ProviderRequest,
): AsyncGenerator<ProviderEvent> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), request.timeoutMs);
  const signal = AbortSignal.any([request.signal, timeout.signal]);
  let responseReceived = false;
  let sent = false;
  let receipt: Extract<ProviderEvent, { type: "usage" }> | null = null;
  const evidence: StopEvidence = {
    generationId: null,
    promptUsage: null,
    reasoningBytes: 0,
    reasoningSeen: false,
  };
  let reasoningTokens = 0,
    toolTokens = 0,
    respondedAt = 0,
    visibleAt = 0;
  const toolInputs = new Set<string>();
  try {
    signal.throwIfAborted();
    sent = true;
    const result = await model.doStream({
      prompt: request.body.prompt,
      ...(request.body.tools.length ? { tools: request.body.tools } : {}),
      maxOutputTokens: request.body.maxOutputTokens,
      providerOptions: assistantProviderOptions(request.provider, request.effort, request.model),
      abortSignal: signal,
      // Anthropic reports measured input in message_start, before any output.
      ...(request.provider === "anthropic" ? { includeRawChunks: true } : {}),
    });
    responseReceived = true;
    respondedAt = Date.now();
    const headers = result.response?.headers ?? {};
    let finish: Extract<LanguageModelV4StreamPart, { type: "finish" }> | null = null;
    const reasoning = new Map<string, { text: string; anthropic: Record<string, unknown> }>();
    for await (const part of readParts(result.stream, signal)) {
      if (part.type === "text-delta" && part.delta) {
        visibleAt ||= Date.now();
        yield { type: "text-delta", text: part.delta };
      } else if (
        part.type === "reasoning-start" ||
        part.type === "reasoning-delta" ||
        part.type === "reasoning-end"
      ) {
        const block = reasoning.get(part.id) ?? { text: "", anthropic: {} };
        evidence.reasoningSeen = true;
        if (part.type === "reasoning-delta") {
          block.text += part.delta;
          evidence.reasoningBytes += Buffer.byteLength(part.delta, "utf8");
          reasoningTokens += estimateTextTokens(part.delta);
        }
        Object.assign(block.anthropic, object(part.providerMetadata?.anthropic));
        reasoning.set(part.id, block);
        const replay = part.type === "reasoning-end" ? anthropicReasoning(request, block) : null;
        if (replay) yield replay;
      } else if (part.type === "tool-input-delta") {
        visibleAt ||= Date.now();
        toolInputs.add(part.id);
        toolTokens += estimateTextTokens(part.delta);
      } else if (part.type === "tool-call" && !part.providerExecuted) {
        visibleAt ||= Date.now();
        if (!toolInputs.has(part.toolCallId)) toolTokens += estimateTextTokens(part.input || "{}");
        yield {
          type: "tool-call",
          id: part.toolCallId,
          name: part.toolName,
          argumentsJson: part.input || "{}",
        };
      } else if (part.type === "response-metadata" && part.id) evidence.generationId = part.id;
      else if (part.type === "raw") evidence.promptUsage ??= anthropicPromptUsage(part.rawValue);
      else if (part.type === "error") throw new Error("Provider stream error");
      else if (part.type === "finish") {
        finish = part;
        const complete = !["interrupted", "error"].includes(part.finishReason.unified);
        const usage = complete ? assistantUsageFromSdk(request.provider, part.usage) : null;
        const reported = providerReportedCost(request.provider, part.providerMetadata);
        if (usage)
          receipt = {
            type: "usage",
            usage,
            requestId:
              evidence.generationId ?? headers["x-request-id"] ?? headers["request-id"] ?? null,
            ...(reported === undefined ? {} : { providerReportedCostUsd: reported }),
          };
      }
    }
    // A stream that ended without a completion signal is never accepted as a receipt.
    if (!receipt || !finish) throw new Error("Incomplete provider receipt");
    yield receipt;
    yield { type: "finish", reason: finish.finishReason.raw ?? finish.finishReason.unified };
  } catch (error) {
    const stopped = request.signal.aborted || timeout.signal.aborted;
    if (stopped && receipt) yield receipt;
    // Owner rule: charge from what arrived. A request never sent, or one that got nothing back
    // from the provider (any error status, a server error, 408, a lost connection), costs
    // nothing. A cut by our own Stop or timeout is not a provider failure and stays charged.
    const rejected = !sent || (!stopped && !responseReceived);
    const certainRefusal =
      APICallError.isInstance(error) &&
      error.statusCode !== undefined &&
      error.statusCode >= 400 &&
      error.statusCode < 500 &&
      error.statusCode !== 408;
    const providerFailure = rejected && sent && !certainRefusal;
    // Any other call that went out without a usable receipt (cut by us, a stream error after the
    // response began, a stream without finish, an unreadable usage) may have generated output:
    // it is charged from what arrived, never left unknown.
    if (!rejected && !receipt) {
      const end = visibleAt || Date.now();
      const reasoningWindowMs = responseReceived ? Math.max(0, end - respondedAt) : 0;
      yield {
        type: "stopped",
        evidence: { ...evidence, reasoningTokens, toolTokens, reasoningWindowMs },
      };
    }
    const code: AssistantErrorCode = request.signal.aborted
      ? "cancelled"
      : timeout.signal.aborted
        ? "timeout"
        : responseReceived
          ? "usage_unknown"
          : callError(error, request.funding);
    // Only a certain refusal of a sent request that got no response and was not cut by us.
    const keyRejection =
      rejected && sent && certainRefusal ? keyRejectionOf(error, request.provider) : null;
    yield rejected
      ? providerFailure
        ? { type: "error", code, rejected: true, providerFailure: true }
        : keyRejection
          ? { type: "error", code, rejected: true, keyRejection }
          : { type: "error", code, rejected: true }
      : { type: "error", code };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Anthropic requires signed thinking blocks back before the tool calls of the turn that made
 * them. Only the signature or redacted payload is replayed; other providers need none.
 */
function anthropicReasoning(
  request: ProviderRequest,
  block: { text: string; anthropic: Record<string, unknown> },
): Extract<ProviderEvent, { type: "reasoning" }> | null {
  if (request.provider !== "anthropic") return null;
  const { signature, redactedData } = block.anthropic;
  if (typeof signature === "string")
    return { type: "reasoning", text: block.text, providerOptions: { anthropic: { signature } } };
  if (typeof redactedData === "string")
    return { type: "reasoning", text: "", providerOptions: { anthropic: { redactedData } } };
  return null;
}

function anthropicPromptUsage(raw: unknown): StopEvidence["promptUsage"] {
  const value = object(raw);
  if (value.type !== "message_start") return null;
  const usage = object(object(value.message).usage);
  const count = (item: unknown) =>
    typeof item === "number" && Number.isSafeInteger(item) && item >= 0 ? item : null;
  const input = count(usage.input_tokens);
  const cacheRead = count(usage.cache_read_input_tokens ?? 0);
  const cacheWrite = count(usage.cache_creation_input_tokens ?? 0);
  if (input === null || cacheRead === null || cacheWrite === null) return null;
  return { input, cacheRead, cacheWrite };
}

function callError(error: unknown, funding: ProviderRequest["funding"]): AssistantErrorCode {
  if (!APICallError.isInstance(error) || error.statusCode === undefined)
    return "provider_unavailable";
  if (error.statusCode === 400 && errorCode(error) === "model_not_found")
    return "model_unavailable";
  return statusError(error.statusCode, funding);
}

function errorCode(error: APICallError): unknown {
  let body: unknown = error.data;
  if (body === undefined && error.responseBody) {
    try {
      body = JSON.parse(error.responseBody);
    } catch {
      body = undefined;
    }
  }
  return object(object(body).error).code;
}

/** Reads model parts and stops at once on abort, whether or not the model honours the signal. */
async function* readParts<T>(stream: ReadableStream<T>, signal: AbortSignal): AsyncGenerator<T> {
  const reader = stream.getReader();
  let abort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    abort = () => reject(new DOMException("Aborted", "AbortError"));
  });
  aborted.catch(() => {});
  if (signal.aborted) abort();
  else signal.addEventListener("abort", abort, { once: true });
  try {
    while (true) {
      const next = await Promise.race([reader.read(), aborted]);
      if (next.done) return;
      yield next.value;
    }
  } finally {
    signal.removeEventListener("abort", abort);
    void reader.cancel().catch(() => {});
  }
}
