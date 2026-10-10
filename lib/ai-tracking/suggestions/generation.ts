import "server-only";
import type { AiResearchContext } from "@/lib/ai-research/service";
import { reauthorizeTrackingActor } from "@/lib/ai-tracking/admission/actor";
import type { JsonValue } from "@/lib/ai-tracking/contract";
import type { GenerationEvidence } from "@/lib/ai-tracking/stores/generation-contract";
import {
  claimSuggestionGeneration,
  persistSuggestionGeneration,
  startSuggestionGeneration,
  suggestionGenerationRequestHash,
} from "@/lib/ai-tracking/stores/suggestion-generations";
import { prisma } from "@/lib/db/prisma";
import { z } from "zod";
import { failSuggestionGeneration } from "./generation-failure";
import { nativeGenerationReceipt } from "./generation-receipt";
import {
  modelSuggestionsGenerateInputSchema,
  SuggestionGenerationError,
  type SuggestionGenerationResult,
} from "./generation-schema";
import { executeSuggestionModel, type GenerationExecutionState } from "./model-execution";
import { extractGenerationResult, parseGenerationResult } from "./model-payload";
import { prepareSuggestionPreview } from "./preview";

export async function previewModelSuggestions(context: AiResearchContext, input: unknown) {
  return (await prepareSuggestionPreview(context, input)).preview;
}
export async function generateModelSuggestions(
  context: AiResearchContext,
  rawInput: unknown,
  idempotencyKey: string,
): Promise<SuggestionGenerationResult> {
  const { preview } = modelSuggestionsGenerateInputSchema.parse(rawInput);
  z.uuid().parse(idempotencyKey);
  if (!context.actorId) throw new Error("Generation requires its original authorized actor.");
  await reauthorizeTrackingActor(context.projectId, {
    actorId: context.actorId,
    actorCredential: context.origin.credential,
  });
  const identity = {
    preview,
    actorId: context.actorId,
    actorCredential: context.origin.credential,
    entrySource: context.origin.source,
  };
  const requestHash = suggestionGenerationRequestHash(identity);
  const existing = await prisma.aiTrackingSuggestionGeneration.findUnique({
    where: { projectId_idempotencyKey: { projectId: context.projectId, idempotencyKey } },
  });
  if (existing) {
    if (existing.requestHash !== requestHash)
      throw new SuggestionGenerationError(
        409,
        "idempotency_conflict",
        "This generation key is already bound to a different reviewed request or actor.",
        existing.publicId,
      );
    if (existing.state === "completed" && existing.result)
      return existing.result as unknown as SuggestionGenerationResult;
    throw new SuggestionGenerationError(
      409,
      "usage_reconciliation_required",
      "This generation attempt cannot be submitted again. Review its durable result or reconcile its provider receipt.",
      existing.publicId,
    );
  }
  if (Date.parse(preview.expiresAt) <= Date.now())
    throw new SuggestionGenerationError(
      409,
      "stale_preview",
      "The reviewed generation preview expired. Preview it again.",
    );
  const prepared = await prepareSuggestionPreview(context, {
    configuration: preview.configuration,
    inputSnapshot: preview.inputSnapshot,
    credentialConnectionId: preview.credentialConnectionId,
  }).catch((error: unknown) => {
    if (error instanceof SuggestionGenerationError && error.reason === "own_credentials_required")
      throw new SuggestionGenerationError(
        409,
        "stale_preview",
        "The approved provider credential is no longer available. Review a new connection and forecast.",
      );
    throw error;
  });
  for (const key of [
    "snapshotHash",
    "credentialConnectionId",
    "credentialVersion",
    "budgetRevision",
    "consentRevision",
    "estimatedCostCents",
  ] as const)
    if (prepared.preview[key] !== preview[key])
      throw new SuggestionGenerationError(
        409,
        "stale_preview",
        "The model, reviewed snapshot, pricing, credential or budget changed. Review a new forecast before generation.",
      );
  const started = await startSuggestionGeneration(context.projectId, {
    ...identity,
    idempotencyKey,
    requestHash,
  });
  if (!started.created)
    throw new SuggestionGenerationError(
      409,
      "generation_in_progress",
      "This generation is already reserved; no second provider submission is allowed.",
    );
  const row = started.row;
  if (!(await claimSuggestionGeneration(context.projectId, row.id, row.attemptId)))
    throw new SuggestionGenerationError(
      409,
      "generation_in_progress",
      "This generation is already claimed.",
      row.publicId,
    );
  const state: GenerationExecutionState = {
    dispatched: false,
    barrier: false,
    nativeId: null,
    receipt: {
      providerCostEntryId: null,
      amountUsd: null,
      state: "unknown",
      connectionId: prepared.source.connection.id,
      credentialVersion: preview.credentialVersion,
    },
  };
  let evidence: GenerationEvidence = {
    inputSnapshot: preview.inputSnapshot,
    snapshotHash: preview.snapshotHash,
    requestedModel: preview.configuration.model,
    actualModel: null,
    providerRequestId: null,
    answer: "",
    configuration: preview.configuration,
    credentialVersion: preview.credentialVersion,
    budgetRevision: preview.budgetRevision,
    consentRevision: preview.consentRevision,
  };
  try {
    const response = await executeSuggestionModel(context, prepared, row, state);
    evidence.raw = (response.result ?? null) as JsonValue;
    evidence.providerRequestId = response.providerRequestId ?? null;
    try {
      evidence = { ...evidence, ...extractGenerationResult(response.result) };
    } catch {
      /* Preserve the frozen review and native request even for invalid provider data. */
    }
    state.receipt = await nativeGenerationReceipt(context.projectId, state.receipt);
    if (state.receipt.state !== "confirmed")
      throw new Error("Generation native cost remains unknown.");
    const parsed = parseGenerationResult(response.result);
    const result: SuggestionGenerationResult = {
      generationId: row.publicId,
      drafts: parsed.drafts,
      costUsd: state.receipt.amountUsd,
      costState: "confirmed",
      method: "model_generated_hypothesis",
      limitations: prepared.preview.limitations,
    };
    const retained = await persistSuggestionGeneration(context.projectId, row.id, {
      attemptId: row.attemptId,
      expectedState: "submission_started",
      state: "completed",
      result,
      receipt: state.receipt,
      actualModel: parsed.actualModel,
      evidence,
    });
    if (!retained) throw new Error("Generation result lost its durable dispatch claim.");
    return result;
  } catch (error) {
    return failSuggestionGeneration(context, row, state, evidence, error);
  }
}
