import type { ModelColumn } from "@/lib/model-playground/types";
import type { ModelNormalizedResponse } from "@/lib/providers/model/transport-evidence";
import { acceptsActualModel, capability } from "./capabilities";
import { normalizeText } from "./citations";
import { type NativeResponse, nativeEnvelopeSchema, nativeResponseSchema } from "./native-schema";
import { consultedSources } from "./sources";
import { unsettledResponse } from "./unsettled";
import { normalizeUsage } from "./usage";

function failureCode(code: string | undefined): ModelNormalizedResponse["failure"] {
  switch (code) {
    case "model_not_found":
      return "unsupported_model";
    case "invalid_api_key":
      return "invalid_credentials";
    case "rate_limit_exceeded":
      return "rate_limited";
    default:
      return "provider_error";
  }
}

function readOutput(response: NativeResponse) {
  const messages = response.output.filter((item) => item.type === "message");
  const calls = response.output.filter((item) => item.type === "web_search_call");
  return {
    blocks: messages.flatMap((item) =>
      item.content.filter((block) => block.type === "output_text"),
    ),
    refused: messages.some((item) => item.content.some((block) => block.type === "refusal")),
    unfinished: response.output.some(
      (item) => item.status !== undefined && item.status !== "completed",
    ),
    toolCalls: calls.length,
  };
}

function outcome(
  response: NativeResponse,
  invalidResponse: boolean,
  refused: boolean,
  text: ReturnType<typeof normalizeText>,
  provider: boolean,
): Pick<ModelNormalizedResponse, "state" | "failure"> {
  if (invalidResponse) return { state: "failed", failure: "invalid_response" };
  if (refused || response.incomplete_details?.reason === "content_filter")
    return { state: "failed", failure: "refused" };
  if (response.status === "failed")
    return { state: "failed", failure: failureCode(response.error?.code) };
  if (provider || text.application || text.omitted) return { state: "partial", failure: null };
  if (!text.answer) throw new Error();
  return { state: "completed", failure: null };
}

export function normalizeResponse(
  raw: unknown,
  column: ModelColumn,
  maxCalls: number,
): ModelNormalizedResponse {
  const envelope = nativeEnvelopeSchema.parse(raw);
  if (["in_progress", "queued", "cancelled"].includes(envelope.status))
    return unsettledResponse(envelope, maxCalls > 0);
  const response = nativeResponseSchema.parse(raw);
  if (!capability(response.model)) throw new Error();
  const modelMismatch = !acceptsActualModel(column.modelId, response.model);
  if (response.status === "completed" && (response.error || response.incomplete_details))
    throw new Error();
  if (new Set(response.output.map((item) => item.id)).size !== response.output.length)
    throw new Error();
  const { blocks, refused, unfinished, toolCalls } = readOutput(response);
  if (toolCalls > maxCalls || (maxCalls === 0 && blocks.some((b) => b.annotations.length)))
    throw new Error();
  const text = normalizeText(blocks);
  const usage = normalizeUsage(response.usage, response.tool_usage, maxCalls > 0);
  const unexpectedSearch = maxCalls === 0 && usage.searchCalls !== null && usage.searchCalls > 0;
  const provider = response.status === "incomplete" || unfinished;
  const truncation = { provider, application: text.application, citations: text.omitted };
  return {
    actualProviderId: "openai",
    actualModelId: response.model,
    ...outcome(response, modelMismatch || unexpectedSearch, refused, text, provider),
    answer: text.answer,
    truncation,
    citations: text.citations,
    citationTotals: provider ? { total: null, omitted: null } : text.totals,
    consultedSources: consultedSources(response, maxCalls > 0),
    usage,
    providerCost: {
      amount: null,
      currency: "USD",
      certainty: "unknown",
      basis: "unknown",
      rateCardVersion: null,
    },
    paymentReceipt: null,
    rawEvidenceId: null,
  };
}
