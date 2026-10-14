import { assertProviderCostLimit } from "@/lib/providers/cost-limit";
import type { ReserveInput } from "@usagekit/core";
import { decimalQuantity } from "@usagekit/providers";
import { z } from "zod";
import type { PaidAttemptInput } from "./paid-attempt-types";
import {
  paidAttemptContextSchema as historicalContext,
  preparePaidAttempt as prepareHistorical,
} from "./paid-quote";

export { platformAllocationTag } from "./paid-quote";

const id = z.string().min(1).max(256);
const contextSchema = historicalContext.extend({
  recoveryGrantExpiresAt: z.iso.datetime().optional(),
  recoveryMaxCostCents: z
    .string()
    .regex(/^\d+(\.\d+)?$/)
    .optional(),
  maxCustomerCostCents: z
    .string()
    .regex(/^-?\d+(\.\d+)?$/)
    .optional(),
  feature: id.optional(),
  requestPricing: z
    .object({
      version: z.literal(1),
      provider: id,
      operation: id,
      options: z.record(z.string().min(1).max(128), z.string().max(256)),
      budgetValuation: z
        .object({
          source: z.enum(["manual", "reference"]),
          perUnitCents: z.string().regex(/^\d+(\.\d{1,6})?$/),
          unitsPerCheck: z.union([z.literal(1), z.literal(2), z.literal(5), z.literal(10)]),
        })
        .strict()
        .optional(),
      maxCostCents: z
        .string()
        .regex(/^\d+(\.\d+)?$/)
        .optional(),
    })
    .strict()
    .optional(),
});

/** Keep checksum-covered historical migration inputs immutable as live admission evolves. */
export function preparePaidAttempt(input: PaidAttemptInput): ReserveInput {
  const {
    feature,
    requestPricing,
    maxCustomerCostCents,
    recoveryGrantExpiresAt: _recoveryExpiry,
    recoveryMaxCostCents,
    ...context
  } = contextSchema.parse(input.context);
  const request = input.reservation;
  if (
    requestPricing &&
    (!feature ||
      requestPricing.provider !== request.provider ||
      requestPricing.operation !== request.operation ||
      JSON.stringify(Object.entries(requestPricing.options).sort()) !==
        JSON.stringify(Object.entries(request.options ?? {}).sort()))
  )
    throw new Error("Paid attempt pricing proof disagrees with the request");
  const result = prepareHistorical({ ...input, context });
  if (maxCustomerCostCents !== undefined) {
    const customer = result.estimate.find((q) => q.unit === "customer_cents");
    if (request.fundingSource !== "platform" || !customer)
      throw new Error("Customer cost consent requires platform funding");
    assertProviderCostLimit([{ ...customer, unit: "cents" }], maxCustomerCostCents);
  }
  const valuation = requestPricing?.budgetValuation;
  if (valuation) {
    if (
      request.fundingSource !== "byok" ||
      request.provider !== "serpapi" ||
      request.operation !== "search" ||
      !request.estimate?.some((q) => q.unit === "cents" && q.value === 0n) ||
      !request.estimate?.some((q) => q.unit === "units" && q.value === 1n && q.scale === 0)
    )
      throw new Error("Search budget valuation disagrees with native units");
    return enforceRecoveryQuote(
      {
        ...result,
        estimate: [
          ...result.estimate.filter((q) => q.unit !== "budget_cents"),
          decimalQuantity(valuation.perUnitCents, "budget_cents"),
        ],
      },
      recoveryMaxCostCents,
    );
  }
  if (request.fundingSource !== "platform")
    return enforceRecoveryQuote(result, recoveryMaxCostCents);
  // Customer prices have their own authority and cannot carry BYOK provider provenance.
  const { estimateSource: _providerSource, ...customerPrice } = result;
  return enforceRecoveryQuote(customerPrice, recoveryMaxCostCents);
}
function enforceRecoveryQuote(result: ReserveInput, maximum?: string): ReserveInput {
  if (maximum === undefined) return result;
  const unit =
    result.fundingSource === "platform"
      ? "customer_cents"
      : result.estimate.some((q) => q.unit === "budget_cents")
        ? "budget_cents"
        : "cents";
  const estimate = result.estimate.find((q) => q.unit === unit);
  if (!estimate) throw new Error("Recovery requires the original cost quote");
  assertProviderCostLimit([{ ...estimate, unit: "cents" }], maximum);
  return result;
}
