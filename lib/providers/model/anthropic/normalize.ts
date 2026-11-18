import { modelIdSchema } from "@/lib/model-playground/schema";
import type { ModelColumn } from "@/lib/model-playground/types";
import { modelWorkspaceIdSchema } from "@/lib/providers/model/routing-settings";
import type { ModelNormalizedResponse } from "@/lib/providers/model/transport-evidence";
import type { ModelTransportResponse } from "@/lib/providers/model/transport-io";
import { SEARCH_MODE } from "./capabilities";
import { normalizeContent } from "./content";
import { normalizeUsage, record } from "./usage";

export function normalizeResponse(
  response: ModelTransportResponse,
  column: ModelColumn,
  apiKey: string,
): ModelNormalizedResponse {
  const body = record(response.body);
  const workspace = modelWorkspaceIdSchema.safeParse(response.resolvedWorkspaceId);
  const resolvedWorkspaceId =
    workspace.success && !workspace.data.includes(apiKey) ? workspace.data : null;
  const reportedModel = modelIdSchema.safeParse(body?.model);
  const actualModelId =
    reportedModel.success && !reportedModel.data.includes(apiKey) ? reportedModel.data : null;
  const base: ModelNormalizedResponse = {
    actualProviderId: null,
    ...(resolvedWorkspaceId ? { resolvedWorkspaceId } : {}),
    actualModelId: body?.type === "message" && body.role === "assistant" ? actualModelId : null,
    state: "failed",
    failure: "invalid_response",
    answer: null,
    truncation: { provider: false, application: false, citations: false },
    citations: [],
    usage: normalizeUsage(body?.usage, { searchEnabled: column.settings.search.mode !== "off" }),
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
  if (body?.type !== "message" || body.role !== "assistant" || !actualModelId) return base;
  if (actualModelId !== column.modelId) return { ...base, failure: "unsupported_model" };
  try {
    const content = normalizeContent(
      body.content,
      column.settings.search.mode === SEARCH_MODE,
      apiKey,
    );
    const reason = body.stop_reason;
    const refused = reason === "refusal" || record(body.stop_details)?.type === "refusal";
    const finished = reason === "end_turn" || reason === "stop_sequence";
    const incomplete =
      typeof reason === "string" &&
      ["max_tokens", "model_context_window_exceeded", "pause_turn", "tool_use"].includes(reason);
    const invalid = !refused && !finished && !incomplete;
    const noAnswer = content.answer.length === 0 && finished && !content.toolError;
    const partial =
      incomplete ||
      content.application ||
      content.truncatedCitations ||
      content.toolError ||
      content.pendingTool ||
      invalid;
    return {
      ...base,
      answer: content.answer,
      citations: content.citations,
      citationTotals: content.citationTotals,
      ...(content.consultedSources ? { consultedSources: content.consultedSources } : {}),
      state: refused || noAnswer ? "failed" : partial ? "partial" : "completed",
      failure: refused
        ? "refused"
        : invalid || noAnswer
          ? "invalid_response"
          : content.toolError || content.pendingTool
            ? "provider_error"
            : null,
      truncation: {
        provider: incomplete || invalid || content.pendingTool,
        application: content.application,
        citations: content.truncatedCitations,
      },
    };
  } catch {
    return base;
  }
}
