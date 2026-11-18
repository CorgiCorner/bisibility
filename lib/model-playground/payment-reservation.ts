import { decimalQuantity } from "@/lib/metering/mapping";
import { modelSettlementPolicy } from "@/lib/metering/model-payment";
import type { PaidAttemptInput } from "@/lib/metering/paid-attempt-types";
import type { ModelPaymentQuote } from "./payment";

export function modelPaymentReservations(quote: ModelPaymentQuote): PaidAttemptInput[] {
  return quote.context.columns.map(({ binding: b, advisory }) => ({
    reservation: {
      operationId: b.attemptId,
      scope: {
        namespace: quote.context.namespace,
        principal: b.principal,
        group: b.projectId,
        connection: b.connectionId,
        providerCredentialVersion: b.credentialVersion,
      },
      fundingSource: b.fundingSource,
      costOwner: b.fundingSource === "platform" ? "platform" : b.principal,
      operation: "model_playground",
      source: b.source,
      surface: ["app", "worker"].includes(b.source) ? "app" : "programmatic",
      provider: b.column.providerId,
      providerPriceVersion: b.rateCard?.version,
      estimateSource: "list",
      reservationTtlMs: 86400000,
      settlementPolicy: modelSettlementPolicy(b),
      estimate: [
        decimalQuantity(advisory.cents, "budget_cents", advisory.cents.split(".")[1]?.length ?? 0),
        ...(b.fundingSource === "byok" && advisory.basis === "rate_card"
          ? [decimalQuantity(advisory.cents, "cents", advisory.cents.split(".")[1]?.length ?? 0)]
          : []),
        { unit: "requests", value: 1n, scale: 0 },
      ],
    },
    context: {
      feature: "model_playground",
      projectId: b.projectId,
      connectionId: b.connectionId,
      publicConnectionId: b.column.connectionId,
      providerCredentialVersion: b.credentialVersion,
      correlationId: quote.quoteId,
    },
  }));
}
