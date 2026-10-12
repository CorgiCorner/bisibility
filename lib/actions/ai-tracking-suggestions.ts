"use server";
import type { TrackingGenerationActionResult } from "@/lib/ai-tracking/projections/generation-result";
import {
  generateModelSuggestions,
  previewModelSuggestions,
} from "@/lib/ai-tracking/suggestions/generation";
import { SuggestionGenerationError } from "@/lib/ai-tracking/suggestions/generation-schema";
import { projectContextSuggestions } from "@/lib/ai-tracking/suggestions/project";
import { auditTrackingGeneration } from "@/lib/api/ai-tracking-audit";
import { trackingScope } from "@/lib/api/ai-tracking-service";
import { budgetFailureResult } from "@/lib/rank-check/budget-failure";
import { z } from "zod";
import { getActionActor } from "./_shared";
import { type ActionFailure, mapActionFailure } from "./action-result";

async function publicResult<T>(run: () => Promise<T>): Promise<TrackingGenerationActionResult<T>> {
  try {
    return { ok: true, value: await run() };
  } catch (error) {
    const budget = budgetFailureResult(error);
    if (budget)
      return {
        ok: false,
        error: { code: budget.code, message: budget.message, status: 429, reason: budget.code },
      };

    if (error instanceof SuggestionGenerationError) {
      const failure: ActionFailure =
        error.reason === "budget_missing" ||
        error.reason === "budget_exhausted" ||
        error.reason === "usage_reconciliation_required"
          ? { code: error.reason, status: 429, message: error.message }
          : error.status === 409
            ? { code: "conflict", status: 409, message: error.message }
            : { code: "invalid_input", status: 400, message: error.message };
      return {
        ok: false,
        error: {
          ...failure,
          reason: error.reason,
          ...(typeof error.generationId === "string" ? { generationId: error.generationId } : {}),
        },
      };
    }
    if (error instanceof z.ZodError)
      return {
        ok: false,
        error: {
          code: "invalid_input",
          status: 400,
          reason: "invalid_configuration",
          message: error.issues[0]?.message ?? "Review the generation input.",
        },
      };
    const known = mapActionFailure(error);
    if (known) return { ok: false, error: { ...known, reason: known.code } };
    throw error;
  }
}

export async function getAiTrackingSuggestionReviewAction(projectId: string) {
  return publicResult(async () => {
    const actor = await getActionActor();
    const project = await trackingScope(actor, projectId);
    const result = await projectContextSuggestions(actor, project);
    return { inputSnapshot: result.inputSnapshot, contextUpdatedAt: result.contextUpdatedAt };
  });
}
export async function previewAiTrackingSuggestionsAction(projectId: string, input: unknown) {
  return publicResult(async () => {
    const actor = await getActionActor();
    const project = await trackingScope(actor, projectId);
    return previewModelSuggestions(
      { projectId: project.id, actorId: actor.id, origin: { source: "app" } },
      input,
    );
  });
}
export async function generateAiTrackingSuggestionsAction(
  projectId: string,
  input: unknown,
  idempotencyKey: string,
) {
  return publicResult(async () => {
    const actor = await getActionActor();
    const project = await trackingScope(actor, projectId, true);
    const result = await generateModelSuggestions(
      { projectId: project.id, actorId: actor.id, origin: { source: "app" } },
      input,
      idempotencyKey,
    );
    await auditTrackingGeneration(actor, project, result.generationId);
    return result;
  });
}
