import { modelUsageDigest, validateModelUsageReceipt } from "@/lib/model-playground/usage";
import type { ModelUsageBinding } from "@/lib/model-playground/usage-contract";
import type { LoadedModelUsageEvidence } from "@/lib/model-playground/usage-storage";
import { shiftUsageDecimal } from "@/lib/model-playground/usage-valuation";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import { NATIVE_MODEL_PROVIDERS } from "@/lib/providers/model/types";
import type { Receipt, ReserveInput, SettlementPolicy } from "@usagekit/core";
import { decimalQuantity } from "./mapping";
import { modelUsageAdvisoryMeasurements, modelUsageMeasurements } from "./model-usage";
import type { PaidAttemptInput } from "./paid-attempt-types";
import { preparePaidAttempt as preparePricedAttempt } from "./paid-quote";
import { projectFundingTag } from "./project-funding-budgets";

export function modelSettlementPolicy(binding: ModelUsageBinding): SettlementPolicy {
  // Financial settlement may finish from a measured wallet debit while native usage remains unknown.
  if (binding.fundingSource === "platform")
    return { requiredUnits: ["customer_cents"], requireMoney: false };
  const units = binding.policy.billableDimensions.map((dimension) =>
    dimension.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`),
  );
  return {
    requiredUnits: [
      ...units,
      ...binding.policy.cacheWriteTtls.map((ttl) => `cache_write_input_tokens_${ttl}s`),
    ],
    requireMoney: false,
  };
}

/** Narrow native branch; the legacy cents-valued quote remains unchanged. */
export function prepareModelPaidAttempt(input: PaidAttemptInput): ReserveInput {
  const r = input.reservation,
    c = input.context;
  if (r.fundingSource === "platform") {
    if (
      !NATIVE_MODEL_PROVIDERS.some((id) => id === r.provider && id !== "vercel_ai_gateway") ||
      c.feature !== "model_playground" ||
      r.operation !== "model_playground" ||
      c.publicConnectionId !== `platform:${r.provider}` ||
      !r.scope.connection.startsWith("platform:") ||
      !["app", "worker"].includes(r.source) ||
      !r.settlementPolicy ||
      !r.settlementPolicy.requiredUnits.includes("customer_cents")
    )
      throw new Error("Native platform admission requires a scoped, priced app request.");
    const { feature: _feature, ...context } = c;
    // Customer prices have their own frozen authority. estimateSource describes
    // BYOK provider valuation and is rejected by Meter on platform reservations.
    const { estimateSource: _providerSource, ...prepared } = preparePricedAttempt({
      ...input,
      context,
    });
    return {
      ...prepared,
      scope: {
        ...prepared.scope,
        tags: [
          ...new Set([...(prepared.scope.tags ?? []), projectFundingTag("platform", c.projectId)]),
        ],
      },
    };
  }
  if (
    r.fundingSource !== "byok" ||
    !NATIVE_MODEL_PROVIDERS.some((id) => id === r.provider) ||
    c.feature !== "model_playground" ||
    r.operation !== "model_playground" ||
    r.scope.group !== c.projectId ||
    r.scope.connection !== c.connectionId ||
    r.scope.providerCredentialVersion !== c.providerCredentialVersion ||
    !r.settlementPolicy ||
    r.settlementPolicy.requireMoney ||
    r.settlementPolicy.requiredUnits.includes("budget_cents") ||
    !r.settlementPolicy.requiredUnits.includes("input_tokens") ||
    !r.settlementPolicy.requiredUnits.includes("output_tokens") ||
    !r.estimate?.some((q) => q.unit === "budget_cents") ||
    r.estimate.some((q) => q.unit === "customer_cents") ||
    r.estimate.some(
      (q) =>
        q.unit === "cents" &&
        !r.estimate?.some(
          (budget) =>
            budget.unit === "budget_cents" && budget.value === q.value && budget.scale === q.scale,
        ),
    ) ||
    input.platformQuote ||
    r.creditAccountRef ||
    r.customerPriceVersion ||
    r.platformPools?.length
  )
    throw new Error("Native admission requires own-key usage and advisory valuation only.");
  return {
    ...r,
    estimate: [...r.estimate, { unit: "paid_attempts", value: 1n, scale: 0 }],
    correlationId: c.correlationId,
    scope: {
      ...r.scope,
      tags: [
        ...new Set([
          ...(r.scope.tags ?? []),
          ownAllocationTag(r.provider, c.connectionId),
          projectFundingTag("byok", c.projectId),
        ]),
      ],
    },
  };
}

/** Never project a forecast as vendor money. Incomplete native dimensions stay unknown. */
export function modelNativeMeterReceipt(loaded: LoadedModelUsageEvidence, now: Date): Receipt {
  if (!loaded.receipt) throw new Error("Native usage binding is unavailable.");
  const receipt = validateModelUsageReceipt(loaded.receipt, loaded.receipt.binding);
  const evidence = receipt.evidence;
  const base = {
    id: modelUsageDigest({ attempt: receipt.binding.attemptId, receipt }),
    source: "dispatch" as const,
    evidenceRef: receipt.binding.attemptId,
    occurredAt: evidence?.occurredAt ?? now.toISOString(),
    recordedAt: now.toISOString(),
    cached: false,
    failed: evidence?.failed ?? true,
    ...(evidence?.providerRequestId ? { providerRequestId: evidence.providerRequestId } : {}),
  };
  if (loaded.canonicalId)
    return {
      ...base,
      canonicalOperationId: loaded.canonicalId,
      measurements: [],
      cost: { certainty: "unknown", money: null },
    };
  const money = receipt.monetary.total;
  const cents =
    money?.certainty !== "reported" || money.amount === null || money.currency !== "USD"
      ? null
      : shiftUsageDecimal(money.amount, 2);
  const scale = cents?.split(".")[1]?.length ?? 0;
  if (scale > 18) throw new Error("Native money exceeds Meter precision.");
  const exact = cents === null ? null : decimalQuantity(cents, "cents", scale);
  const advisoryCents = receipt.budgetValuation.cents;
  const allocationEstimate =
    exact || advisoryCents === null
      ? []
      : [
          {
            unit: "cents",
            certainty: "estimated" as const,
            quantity: decimalQuantity(
              advisoryCents,
              "cents",
              advisoryCents.split(".")[1]?.length ?? 0,
            ),
          },
        ];
  return {
    ...base,
    measurements: [
      ...modelUsageMeasurements(receipt),
      ...modelUsageAdvisoryMeasurements(receipt),
      ...(exact
        ? [{ unit: "cents", certainty: "measured" as const, quantity: exact }]
        : allocationEstimate),
    ],
    cost:
      exact && money?.certainty === "reported" && money.currency === "USD"
        ? {
            certainty: "measured",
            money: { units: exact.value, scale: exact.scale, currency: "USD" },
          }
        : { certainty: "unknown", money: null },
  };
}
