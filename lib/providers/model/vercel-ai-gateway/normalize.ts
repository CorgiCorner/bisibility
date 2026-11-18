import { modelIdSchema } from "@/lib/model-playground/schema";
import { ModelTransportError } from "@/lib/providers/model/errors";
import type { ModelNormalizedResponse } from "@/lib/providers/model/transport-evidence";
import type { ModelTransportResponse } from "@/lib/providers/model/transport-io";
import { normalizeCitations, retainAnswer } from "./citations";
import { routingAttemptCredentials } from "./routing";
import { normalizeMoney, normalizeUsage, record } from "./usage";

function identifier(value: unknown, forbidden: readonly string[]) {
  return typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:/-]{0,255}$/.test(value) &&
    !forbidden.some((secret) => secret && value.includes(secret))
    ? value
    : null;
}

export function normalizeResponse(
  response: ModelTransportResponse,
  requestedModel: string,
  apiKey: string,
  allowedProviders?: readonly string[],
): ModelNormalizedResponse {
  const body = record(response.body);
  if (body.error !== undefined) throw new ModelTransportError("provider_error");
  if (
    body.object !== "chat.completion" ||
    !Array.isArray(body.choices) ||
    body.choices.length !== 1
  )
    throw new ModelTransportError("invalid_response");
  const choice = record(body.choices[0]);
  const message = record(choice.message);
  if (choice.index !== 0 || message.role !== "assistant")
    throw new ModelTransportError("invalid_response");
  const refusal = typeof message.refusal === "string" && message.refusal.length > 0;
  if (typeof message.content !== "string" && !(refusal && message.content === null))
    throw new ModelTransportError("invalid_response");
  const secrets = [apiKey, encodeURIComponent(apiKey), Buffer.from(apiKey).toString("base64")];
  const text = typeof message.content === "string" ? message.content : null;
  if (
    text !== null &&
    (/[\uD800-\uDFFF]/u.test(text) || secrets.some((key) => key && text.includes(key)))
  )
    throw new ModelTransportError("invalid_response");
  const metadata = record(message.provider_metadata);
  const gateway = record(metadata.gateway);
  const routing = record(gateway.routing);
  const actualProviderId = identifier(routing.finalProvider, secrets);
  const model = modelIdSchema.safeParse(body.model);
  const actualModelId = model.success && identifier(model.data, secrets) ? model.data : null;
  const drift = actualModelId !== null && actualModelId !== requestedModel;
  const mismatch = [routing.originalModelId, routing.canonicalSlug].some(
    (value) => value !== undefined && value !== requestedModel,
  );
  const attempts = Array.isArray(routing.modelAttempts) ? routing.modelAttempts.map(record) : [];
  const successful = attempts.filter((attempt) => attempt.success === true);
  const attemptMismatch = successful.some((attempt) => attempt.canonicalSlug !== requestedModel);
  const invalidRouting =
    (routing.finalProvider !== undefined && actualProviderId === null) ||
    successful.length > 1 ||
    attempts.some((attempt) =>
      Array.isArray(attempt.providerAttempts)
        ? attempt.providerAttempts.map(record).filter((provider) => provider.success === true)
            .length > 1 ||
          attempt.providerAttempts.some((value) => {
            const provider = record(value);
            return (
              routing.finalProvider !== undefined &&
              provider.success === true &&
              provider.provider !== actualProviderId
            );
          })
        : false,
    );
  const retained = text === null ? null : retainAnswer(text);
  const annotations = normalizeCitations(message.annotations, retained?.answer ?? null, secrets);
  const providerTruncated = choice.finish_reason === "length";
  const hasTools = Array.isArray(message.tool_calls) && message.tool_calls.length > 0;
  const unexpectedTools = hasTools || gateway.gatewayToolCalls !== undefined;
  const refused = refusal || choice.finish_reason === "content_filter";
  const failure = refused
    ? "refused"
    : drift || mismatch || attemptMismatch
      ? "unsupported_model"
      : actualModelId === null ||
          invalidRouting ||
          unexpectedTools ||
          !["stop", "length"].includes(String(choice.finish_reason))
        ? "invalid_response"
        : null;
  const providerCost = normalizeMoney(invalidRouting ? {} : gateway);
  if (
    providerCost.amount !== null &&
    secrets.some((secret) => secret && providerCost.amount?.includes(secret))
  )
    throw new ModelTransportError("invalid_response");
  return {
    actualProviderId,
    ...(allowedProviders &&
    actualProviderId !== null &&
    !allowedProviders.includes(actualProviderId)
      ? { routingViolation: "provider_outside_allowed_set" as const }
      : {}),
    actualModelId,
    state:
      text === null
        ? "failed"
        : failure || providerTruncated || retained?.truncated || annotations.truncated
          ? "partial"
          : "completed",
    failure,
    answer: retained?.answer ?? null,
    truncation: {
      provider: providerTruncated,
      application: retained?.truncated ?? false,
      citations: annotations.truncated,
    },
    citations: annotations.citations,
    usage: normalizeUsage(body.usage),
    providerCost,
    routingAttemptCredentials: routingAttemptCredentials(routing),
    costEvidence: {
      providerReported:
        providerCost.certainty === "reported"
          ? {
              money: providerCost,
              scope: {
                kind: "subtotal",
                includes: ["inference", "tools"],
                excludes: ["reporting_writes", "zero_data_retention"],
                unknown: ["routing", "other"],
              },
            }
          : null,
      upstreamInference: null,
      localEstimate: null,
    },
    paymentReceipt: null,
    rawEvidenceId: null,
  };
}
