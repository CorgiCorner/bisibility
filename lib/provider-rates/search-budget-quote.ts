import { Prisma } from "@/lib/generated/prisma/client";
import type { ConnectionPolicy } from "@usagekit/core";
import { formatQuantity } from "@usagekit/core";
import { decimalQuantity, serpapi } from "@usagekit/providers";

export type SearchBudgetValuation = {
  source: "manual" | "reference";
  perUnitCents: string;
  unitsPerCheck: number;
};

/** A host budget valuation is not a claim about the connected account's plan or invoice. */
export function searchBudgetQuote(policy: ConnectionPolicy, unitsPerCheck: number) {
  if (![1, 2, 5, 10].includes(unitsPerCheck))
    throw new Error("Search valuation requires a supported check size");
  const descriptor = serpapi.descriptor;
  if (
    !descriptor.prices.length ||
    descriptor.prices.some((row) => row.unit !== "units" || row.perUnit !== "1")
  )
    throw new Error("Search unit pricing changed");
  const reference = descriptor.plans?.find((plan) => plan.id === "production");
  if (!reference?.subscription || !reference.allowance || reference.allowance.value <= 0n)
    throw new Error("Search budget reference is unavailable");
  const manual = policy.manualPrices?.search;
  if (manual && (manual.unit !== "cents" || manual.value < 0n))
    throw new Error("Search manual budget valuation is invalid");
  const perUnit = manual
    ? new Prisma.Decimal(formatQuantity(manual)).div(unitsPerCheck)
    : new Prisma.Decimal(reference.subscription.fee.units.toString())
        .div(10000)
        .div(reference.allowance.value.toString());
  const perUnitCents = perUnit.toFixed(6);
  if (!perUnit.equals(perUnitCents)) throw new Error("Search budget precision exceeded");
  const budgetValuation: SearchBudgetValuation = {
    source: manual ? "manual" : "reference",
    perUnitCents: perUnit.toFixed(),
    unitsPerCheck,
  };
  return {
    source: manual ? ("manual" as const) : ("list" as const),
    quantities: [
      { unit: "cents", value: 0n, scale: 0 },
      { unit: "units", value: 1n, scale: 0 },
      { unit: "requests", value: 1n, scale: 0 },
      decimalQuantity(perUnit.toFixed(), "budget_cents"),
    ],
    priceVersion: `search-budget:${descriptor.prices[0]?.validFrom}`,
    checkedAt: descriptor.prices[0]?.checkedAt,
    sampleSize: undefined,
    budgetValuation,
  };
}
