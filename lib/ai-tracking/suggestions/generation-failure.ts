import "server-only";
import type { AiResearchContext } from "@/lib/ai-research/service";
import {
  type GenerationEvidence,
  persistSuggestionGeneration,
  proveNoDispatch,
} from "@/lib/ai-tracking/stores/suggestion-generations";
import { ProviderUsagePersistenceError } from "@/lib/providers/usage";
import { nativeGenerationReceipt } from "./generation-receipt";
import { SuggestionGenerationError } from "./generation-schema";
import type { GenerationExecutionState } from "./model-execution";

export async function failSuggestionGeneration(
  context: AiResearchContext,
  row: { id: string; publicId: string; attemptId: string },
  state: GenerationExecutionState,
  evidence: GenerationEvidence,
  error: unknown,
): Promise<never> {
  try {
    if (!state.dispatched) {
      if (!state.nativeId && error instanceof ProviderUsagePersistenceError)
        throw new SuggestionGenerationError(
          409,
          "usage_reconciliation_required",
          "Native admission persistence requires reconciliation before a new generation.",
          row.publicId,
        );
      if (state.nativeId && state.observer)
        await state.observer.settle(state.nativeId, {
          cached: false,
          failed: true,
          costCents: 0,
          quantity: 0,
        });
      const proof = await proveNoDispatch(context.projectId, row.id, {
        attemptId: row.attemptId,
        expectedState: state.barrier ? "submission_started" : "claimed",
        reason: error instanceof Error ? error.message : "Admission refused before transport.",
        ...(state.nativeId
          ? { receipt: { ...state.receipt, state: "confirmed", amountUsd: "0" } }
          : {}),
      });
      if (!proof) throw new Error("No-dispatch proof lost its durable claim.");
      throw new SuggestionGenerationError(
        error instanceof SuggestionGenerationError ? error.status : 409,
        error instanceof SuggestionGenerationError ? error.reason : "generation_refused",
        error instanceof SuggestionGenerationError
          ? error.message
          : "Generation was refused before transport. Review provider availability, budget and shared capacity.",
        row.publicId,
      );
    }
    state.receipt = await nativeGenerationReceipt(context.projectId, state.receipt);
    const confirmed = state.receipt.state === "confirmed";
    const retained = await persistSuggestionGeneration(context.projectId, row.id, {
      attemptId: row.attemptId,
      expectedState: "submission_started",
      state: confirmed ? "failed" : "submission_unknown",
      receipt: state.receipt,
      evidence,
    });
    if (!retained) throw new Error("Failed generation lost its durable claim.");
    throw new SuggestionGenerationError(
      409,
      confirmed ? "generation_failed" : "usage_reconciliation_required",
      confirmed
        ? "The provider charge is confirmed but usable drafts could not be saved. This paid attempt will never be resubmitted."
        : "Provider submission or cost is unknown. Reconcile this durable generation; it will never be resubmitted.",
      row.publicId,
    );
  } catch (failure) {
    if (failure instanceof SuggestionGenerationError) throw failure;
    throw new SuggestionGenerationError(
      409,
      "usage_reconciliation_required",
      "Generation persistence could not be confirmed. Reconcile this durable attempt before another submission.",
      row.publicId,
    );
  }
}
