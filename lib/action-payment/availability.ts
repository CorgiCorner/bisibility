import "server-only";
import { ProviderLookupSignal } from "@/lib/provider-lookups/lookup-failure";
import { preflightProviderBudget } from "@/lib/provider-lookups/paid-call-budget";
import { surfaceOf } from "@/lib/provider-usage/surface";
import type { ProviderRequestSource } from "@/lib/provider-usage/tag";
import type { ActionPaymentQuote } from "./contract";
import { readDeploymentPaymentAvailability } from "./deployment-extension";

export async function actionPaymentAvailability(input: {
  quote: ActionPaymentQuote;
  projectId: string;
  actorId?: string | null;
  connectionId: string;
  provider: string;
  source: string;
  providerCostCents: number;
  nativeQuantity?: number;
}) {
  const { quote } = input;
  let denial: ActionPaymentQuote["availability"] | null = null;
  if (quote.charge.certainty !== "free") {
    try {
      await preflightProviderBudget({
        projectId: input.projectId,
        connectionId: input.connectionId,
        provider: input.provider,
        estimatedCostCents: input.providerCostCents,
        estimatedUsageQuantity: input.nativeQuantity,
        estimatedCustomerCents:
          quote.option.fundingSource === "platform" ? Number(quote.charge.value) : undefined,
        surface: surfaceOf(input.source as ProviderRequestSource),
      });
    } catch (error) {
      denial = {
        allowed: false,
        reason:
          error instanceof ProviderLookupSignal
            ? error.outcome.reason
            : "usage_reconciliation_required",
      };
    }
  }
  const deployment =
    quote.option.fundingSource === "platform"
      ? await readDeploymentPaymentAvailability({
          projectId: input.projectId,
          actorId: input.actorId,
          amount: quote.charge.value ?? "0",
        })
      : { availability: { allowed: true, reason: null } };
  return { ...deployment, availability: denial ?? deployment.availability };
}
