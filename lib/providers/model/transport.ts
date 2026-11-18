import "server-only";
import { estimateTextTokens } from "@/lib/assistant/stop-estimate";
import type { ModelInterruption } from "@/lib/model-playground/interruption";
import { fitModelResultSources } from "@/lib/model-playground/result-budget";
import { modelColumnResultSchema } from "@/lib/model-playground/types";
import { consumeProviderLimit } from "@/lib/providers/rate-limit";
import type { z } from "zod";
import { ModelTransportError } from "./errors";
import { MODEL_RESULT_EXTENSIONS_ENABLED } from "./transport-contract";
import { modelDeadline } from "./transport-deadline";
import { transportEvidence, transportFailure } from "./transport-evidence";
import {
  type common,
  encodeBody,
  generation,
  MODEL_TRANSPORT_LIMITS,
  type ModelGenerationInput,
} from "./transport-input";
import type { ModelTransportResponse } from "./transport-io";
import {
  type ModelMetadataInput,
  type ModelMetadataPagesInput,
  type ModelMetadataReader,
  modelMetadataQuery,
  readMetadata,
  readMetadataPages,
} from "./transport-metadata";
import { modelRequest } from "./transport-request";

export { MODEL_TRANSPORT_LIMITS, type ModelGenerationInput } from "./transport-input";
export type { ModelJsonOptions } from "./transport-json";
export type {
  ModelMetadataInput,
  ModelMetadataPage,
  ModelMetadataPages,
  ModelMetadataPagesInput,
} from "./transport-metadata";

async function limitAccount(request: z.infer<typeof common>) {
  try {
    const limit = await consumeProviderLimit(request.providerId, {
      apiKey: request.context.apiKey,
    });
    if (!limit.success) throw new ModelTransportError("rate_limited");
  } catch (error) {
    if (error instanceof ModelTransportError) throw error;
    throw new ModelTransportError("admission_refused");
  }
}

const metadataPage: ModelMetadataReader = async (request, deadline, budget) => {
  await deadline.run(() => limitAccount(request));
  return modelRequest({
    providerId: request.providerId,
    classification: "metadata",
    apiKey: request.context.apiKey,
    workspaceId: request.context.workspaceId,
    maxBytes: request.maxResponseBytes ?? MODEL_TRANSPORT_LIMITS.responseBytes,
    deadline,
    query: modelMetadataQuery(request.page),
    jsonOptions: request.jsonOptions,
    budget,
  });
};
export async function readModelMetadata(
  input: ModelMetadataInput,
): Promise<ModelTransportResponse> {
  return readMetadata(input, metadataPage);
}
export const readModelMetadataPages = (input: ModelMetadataPagesInput) =>
  readMetadataPages(input, metadataPage);

/** Admission and settlement wrap exactly one POST. This function never retries. */
export async function generateModelResponse(input: ModelGenerationInput) {
  if (
    !input?.observer ||
    typeof input.observer.beforeDispatch !== "function" ||
    typeof input.observer.settle !== "function"
  )
    throw new ModelTransportError("observer_required");
  const parsed = generation.safeParse(input);
  if (!parsed.success || parsed.data.column.providerId !== parsed.data.providerId)
    throw new ModelTransportError("invalid_request");
  const request = parsed.data;
  const body = encodeBody(request);
  const beforeDispatch = request.observer.beforeDispatch.bind(request.observer);
  const settle = request.observer.settle.bind(request.observer);
  const startedAt = Date.now();
  const deadline = modelDeadline(
    request.timeoutMs ?? MODEL_TRANSPORT_LIMITS.timeoutMs,
    request.context.signal,
  );
  let dispatched = false;
  let admitted = false;
  let sentAt = startedAt;
  let interruption: ModelInterruption | undefined;
  let result = transportEvidence(request.column, startedAt, null);
  let failure: ModelTransportError | undefined;
  try {
    deadline.check();
    await deadline.run(() => limitAccount(request));
    try {
      // Durable observer callbacks own their persistence deadline. Never race a late fence.
      await beforeDispatch(request.operationKey);
      admitted = true;
    } catch (error) {
      if (error instanceof ModelTransportError) throw error;
      throw new ModelTransportError("admission_refused");
    }
    deadline.check();
    dispatched = true;
    sentAt = Date.now();
    const response = await modelRequest({
      providerId: request.providerId,
      classification: "generation",
      apiKey: request.context.apiKey,
      workspaceId: request.column.settings.workspaceId,
      body,
      maxBytes: request.maxResponseBytes ?? MODEL_TRANSPORT_LIMITS.responseBytes,
      deadline,
      jsonOptions: request.jsonOptions,
    });
    result = transportEvidence(request.column, startedAt, response.requestId);
    try {
      const normalized = { ...request.normalize(response) };
      const extensionKeys = [
        "consultedSources",
        "citationTotals",
        "costEvidence",
        "routingAttemptCredentials",
        "resolvedWorkspaceId",
        "routingViolation",
      ] as const;
      for (const key of extensionKeys) {
        if (normalized[key] === undefined) delete normalized[key];
      }
      if (
        !MODEL_RESULT_EXTENSIONS_ENABLED &&
        extensionKeys.some((key) => Object.hasOwn(normalized, key))
      ) {
        throw new ModelTransportError("invalid_response", true, response.requestId);
      }
      result = modelColumnResultSchema.parse({
        ...normalized,
        ...result,
        actualProviderId: normalized.actualProviderId,
        actualModelId: normalized.actualModelId,
        state: normalized.state,
        failure: normalized.failure,
        answer: normalized.answer,
        truncation: normalized.truncation,
        citations: normalized.citations,
        usage: normalized.usage,
        providerCost: normalized.providerCost,
        paymentReceipt: normalized.paymentReceipt,
        rawEvidenceId: normalized.rawEvidenceId,
      });
      const fitted = fitModelResultSources(result);
      if (fitted) result = modelColumnResultSchema.parse(fitted);
      else {
        failure = new ModelTransportError("invalid_response", true, response.requestId);
        result = modelColumnResultSchema.parse({
          ...transportEvidence(request.column, startedAt, response.requestId),
          failure: "invalid_response",
          actualProviderId: result.actualProviderId,
          actualModelId: result.actualModelId,
          ...(result.resolvedWorkspaceId !== undefined
            ? { resolvedWorkspaceId: result.resolvedWorkspaceId }
            : {}),
          ...(result.routingViolation !== undefined
            ? { routingViolation: result.routingViolation }
            : {}),
          usage: result.usage,
          providerCost: result.providerCost,
          paymentReceipt: result.paymentReceipt,
          rawEvidenceId: result.rawEvidenceId,
          ...(result.costEvidence ? { costEvidence: result.costEvidence } : {}),
          ...(result.routingAttemptCredentials
            ? { routingAttemptCredentials: result.routingAttemptCredentials }
            : {}),
        });
      }
    } catch {
      throw new ModelTransportError("invalid_response", true, response.requestId);
    }
  } catch (error) {
    failure = new ModelTransportError(
      error instanceof ModelTransportError ? error.code : "network_error",
      dispatched,
      error instanceof ModelTransportError ? error.requestId : null,
      error instanceof ModelTransportError ? error.workspaceIssue : undefined,
      error instanceof ModelTransportError ? error.httpStatus : undefined,
    );
    result = transportEvidence(request.column, startedAt, failure.requestId);
    result.failure = transportFailure(failure.code);
    if (!dispatched) result.state = "cancelled";
    if (
      dispatched &&
      (failure.code === "aborted" ||
        failure.code === "timeout" ||
        request.column.payment.fundingSource === "platform")
    ) {
      const requestBody = JSON.parse(body) as { reasoning?: { effort?: string } };
      interruption = {
        version: 1,
        reason:
          failure.httpStatus && failure.httpStatus >= 400 && failure.httpStatus < 500
            ? "rejected"
            : failure.code === "aborted" || failure.code === "timeout"
              ? failure.code
              : "unreported",
        requestBytes: Buffer.byteLength(body),
        requestTokens: estimateTextTokens(body),
        reasoning: Boolean(requestBody.reasoning && requestBody.reasoning.effort !== "none"),
        elapsedMs: Math.min(300_000, Math.max(0, Date.now() - sentAt)),
      };
    }
  } finally {
    deadline.close();
  }
  if (
    (dispatched || admitted) &&
    !interruption &&
    request.column.payment.fundingSource === "platform" &&
    result.usage.completeness !== "complete"
  ) {
    const requestBody = JSON.parse(body) as { reasoning?: { effort?: string } };
    interruption = {
      version: 1,
      reason: dispatched ? "unreported" : "not_called",
      requestBytes: Buffer.byteLength(body),
      requestTokens: estimateTextTokens(body),
      reasoning: Boolean(requestBody.reasoning && requestBody.reasoning.effort !== "none"),
      elapsedMs: Math.min(300_000, Math.max(0, Date.now() - sentAt)),
    };
  }
  if (admitted || dispatched) {
    try {
      if (interruption) await settle(request.operationKey, structuredClone(result), interruption);
      else await settle(request.operationKey, structuredClone(result));
    } catch {
      throw new ModelTransportError("accounting_unknown", dispatched, result.providerRequestId);
    }
  }
  if (failure) throw failure;
  return result;
}
