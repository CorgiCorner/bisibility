import "server-only";
import { aiOwnPaymentQuote, aiPaymentReceipt } from "@/lib/ai-research/payment";
import type { AiResearchContext } from "@/lib/ai-research/service";
import { getSerpProvider } from "@/lib/providers/registry";
import type { SuggestionGenerationPreview } from "./generation-schema";
import type { prepareSuggestionPreview } from "./preview";
export function suggestionPaymentDefinition(preview: SuggestionGenerationPreview) {
  return [
    preview.configuration,
    preview.snapshotHash,
    preview.credentialVersion,
    preview.budgetRevision,
    preview.consentRevision,
  ];
}
export function suggestionPaymentQuote(
  context: AiResearchContext,
  prepared: Pick<Awaited<ReturnType<typeof prepareSuggestionPreview>>, "source" | "preview">,
) {
  return aiOwnPaymentQuote({
    source: { ...prepared.source, provider: getSerpProvider(prepared.source.connection.provider) },
    actorId: context.actorId,
    entrySource: context.origin.source,
    feature: "ai_tracking",
    estimatedCostCents: prepared.preview.estimatedCostCents,
    definition: suggestionPaymentDefinition(prepared.preview),
  });
}
export function suggestionPaymentResult(
  preview: SuggestionGenerationPreview,
  receipt: { amountUsd: string | null; state: string },
  free = false,
) {
  const originalPayment = aiPaymentReceipt(
    preview.paymentConsent,
    receipt.amountUsd,
    receipt.state,
  );
  return originalPayment
    ? {
        originalPayment,
        payment: free
          ? aiPaymentReceipt(preview.paymentConsent, receipt.amountUsd, receipt.state, true)
          : originalPayment,
      }
    : {};
}
