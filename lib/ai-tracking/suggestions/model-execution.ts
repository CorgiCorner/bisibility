import "server-only";
import { aiProviderRequest, PROMPT_PATH } from "@/lib/ai-research/provider";
import type { AiResearchContext } from "@/lib/ai-research/service";
import { reauthorizeTrackingActor } from "@/lib/ai-tracking/admission/actor";
import { trackingAdmissionContext } from "@/lib/ai-tracking/admission/context";
import {
  type GenerationReceipt,
  recordGenerationUsageTag,
} from "@/lib/ai-tracking/stores/suggestion-generations";
import { paidProviderCall } from "@/lib/provider-lookups/paid-call";
import { getSerpProvider } from "@/lib/providers/registry";
import type { ProviderUsageObserver } from "@/lib/providers/usage";
import { SuggestionGenerationError } from "./generation-schema";
import type { prepareSuggestionPreview } from "./preview";

export type GenerationExecutionState = {
  dispatched: boolean;
  barrier: boolean;
  nativeId: string | null;
  observer?: ProviderUsageObserver;
  receipt: GenerationReceipt;
};
type SuggestionModelResponse = Awaited<ReturnType<typeof aiProviderRequest>>;
export async function executeSuggestionModel(
  context: AiResearchContext,
  prepared: Awaited<ReturnType<typeof prepareSuggestionPreview>>,
  row: { id: string; attemptId: string },
  state: GenerationExecutionState,
): Promise<SuggestionModelResponse> {
  const { source, preview, forecast, capabilities } = prepared;
  return paidProviderCall<SuggestionModelResponse>({
    connection: source.connection,
    credential: context.origin.credential,
    correlationId: row.attemptId,
    feature: "ai_tracking",
    itemCount: 1,
    projectId: context.projectId,
    provider: getSerpProvider("dataforseo"),
    requiredCredentialSource: "own",
    source: context.origin.source,
    trigger: "manual",
    rate: {
      providerId: "dataforseo",
      feature: "ai_tracking",
      costCents: preview.estimatedCostCents,
      checkedAt: capabilities.pricingCheckedAt.slice(0, 10),
      sourceUrl: "https://docs.dataforseo.com/v3/appendix/user_data/",
    },
    call: async (credentials, usage) => {
      const observer = credentials.usageObserver;
      if (!observer)
        throw new Error("Model generation requires its native provider usage journal.");
      state.observer = observer;
      const guarded: ProviderUsageObserver = {
        async begin(attempt) {
          const nativeId = await observer.begin(attempt);
          state.nativeId = nativeId;
          state.receipt = { ...state.receipt, providerCostEntryId: nativeId };
          const barrier = await recordGenerationUsageTag(context.projectId, row.id, {
            attemptId: row.attemptId,
            expectedState: "claimed",
            usageTag: usage.tag,
            receipt: state.receipt,
          });
          if (!barrier) {
            await observer.settle(nativeId, {
              cached: false,
              failed: true,
              costCents: 0,
              quantity: 0,
            });
            throw new SuggestionGenerationError(
              409,
              "generation_claim_changed",
              "Generation no longer owns its dispatch claim.",
            );
          }
          state.barrier = true;
          return nativeId;
        },
        async beforeDispatch(id) {
          if (!context.actorId) throw new Error("Generation requires its original actor.");
          await reauthorizeTrackingActor(context.projectId, {
            actorId: context.actorId,
            actorCredential: context.origin.credential,
          });
          const fresh = await trackingAdmissionContext(context.projectId, source.connection.id);
          if (
            fresh.credentialVersion !== preview.credentialVersion ||
            fresh.budgetRevision !== preview.budgetRevision
          )
            throw new SuggestionGenerationError(
              409,
              "stale_preview",
              "Credential or budget changed after the reviewed preview.",
            );
          await observer.beforeDispatch?.(id);
        },
        settle: (id, receipt) => observer.settle(id, receipt),
        // Admission failures are proven before transport and keep the native zero receipt.
        cancel: (id) =>
          observer.settle(id, { cached: false, failed: true, costCents: 0, quantity: 0 }),
      };
      return aiProviderRequest(
        { ...credentials, usageObserver: guarded },
        PROMPT_PATH,
        { ...forecast.payload, tag: usage.tag },
        Date.now() + 120000,
        () => {
          state.dispatched = true;
        },
        context.projectId,
      );
    },
  });
}
