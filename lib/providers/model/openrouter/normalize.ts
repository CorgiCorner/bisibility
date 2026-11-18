import { modelIdSchema } from "@/lib/model-playground/schema";
import { ModelTransportError } from "@/lib/providers/model/errors";
import type { ModelNormalizedResponse } from "@/lib/providers/model/transport-evidence";
import { z } from "zod";
import { MODEL_ID, reviewedModel } from "./capabilities";
import { normalizeCitations, retainAnswer } from "./citations";
import { normalizeOpenRouterAccounting, record } from "./usage";

const identity = z
  .string()
  .min(1)
  .max(256)
  .regex(/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/);

function actual(value: unknown, apiKey: string, model = false): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value === "string" && value.includes(apiKey))
    throw new ModelTransportError("invalid_response");
  const parsed = (model ? modelIdSchema : identity).safeParse(value);
  if (!parsed.success) {
    if (model) throw new ModelTransportError("invalid_response");
    return null;
  }
  return parsed.data;
}

export function normalizeOpenRouterResponse(
  body: unknown,
  search: boolean,
  apiKey: string,
  requestedModel = MODEL_ID,
): ModelNormalizedResponse {
  const expected = reviewedModel(requestedModel);
  if (!expected) throw new ModelTransportError("invalid_request");
  const response = record(body);
  if (
    response.error ||
    response.object !== "chat.completion" ||
    !Array.isArray(response.choices) ||
    response.choices.length !== 1
  )
    throw new ModelTransportError("invalid_response");
  const choice = record(response.choices[0]);
  const message = record(choice.message);
  const content = message.content;
  if (
    message.role !== "assistant" ||
    (content !== null && typeof content !== "string") ||
    (typeof content === "string" && (/[\uD800-\uDFFF]/u.test(content) || content.includes(apiKey)))
  )
    throw new ModelTransportError("invalid_response");
  const actualModelId = actual(response.model, apiKey, true);
  const metadata = record(response.openrouter_metadata);
  const available = record(metadata.endpoints).available;
  const selected = Array.isArray(available)
    ? available.filter((entry) => record(entry).selected === true)
    : [];
  if (selected.length > 1) throw new ModelTransportError("invalid_response");
  const topProvider = actual(response.provider, apiKey);
  const selectedProvider = actual(record(selected[0]).provider, apiKey);
  const providerConflict =
    (response.provider != null && topProvider === null) ||
    (record(selected[0]).provider != null && selectedProvider === null) ||
    (topProvider !== null && selectedProvider !== null && topProvider !== selectedProvider);
  const actualProviderId = providerConflict ? null : (topProvider ?? selectedProvider);
  const answer = typeof content === "string" ? retainAnswer(content) : null;
  const { citations, truncated, credentialEcho } = normalizeCitations(message.annotations, apiKey);
  if (
    citations.some((citation) => citation.url.includes(apiKey) || citation.title?.includes(apiKey))
  )
    throw new ModelTransportError("invalid_response");
  const truncation = {
    provider: choice.finish_reason === "length",
    application: answer !== content,
    citations: truncated,
  };
  const accounting = normalizeOpenRouterAccounting(body, search);
  const failure =
    actualModelId !== null && actualModelId !== expected.id
      ? "unsupported_model"
      : providerConflict ||
          (actualProviderId !== null && actualProviderId !== expected.routing.reported) ||
          (typeof metadata.attempt === "number" && metadata.attempt > 1) ||
          (Array.isArray(metadata.attempts) && metadata.attempts.length > 1)
        ? "provider_error"
        : choice.finish_reason === "content_filter" || typeof message.refusal === "string"
          ? "refused"
          : credentialEcho ||
              choice.error ||
              message.tool_calls ||
              message.function_call ||
              answer === null ||
              !["stop", "length"].includes(String(choice.finish_reason))
            ? "invalid_response"
            : null;
  return {
    actualModelId,
    actualProviderId,
    state: failure ? "failed" : Object.values(truncation).some(Boolean) ? "partial" : "completed",
    failure,
    answer: failure ? null : answer,
    truncation,
    citations: failure || answer === null ? [] : citations,
    usage: accounting.usage,
    providerCost: accounting.providerCost,
    costEvidence: accounting.costEvidence,
    paymentReceipt: null,
    rawEvidenceId: null,
  };
}
