import { estimateSeoMix } from "./seo-mix";
import type { SeoMixField, SeoMixInputs, SeoMixSnapshot } from "./seo-mix-contract";
import { decimalTicks, fixedCents, roundedUnits } from "./seo-mix-money";

function perUnit(usage: string | null, count: number) {
  if (usage === null || count < 1) return null;
  if (count === 1) return usage;
  try {
    return fixedCents(roundedUnits(decimalTicks(usage) / BigInt(count)));
  } catch {
    return null;
  }
}

/** Customer price of one check, search, or report on the same path as the monthly estimate. */
export function seoMixUnitCostCents(
  field: SeoMixField,
  inputs: SeoMixInputs,
  snapshot: SeoMixSnapshot,
): string | null {
  if (field === "keywordCount") {
    const probe = estimateSeoMix(
      { ...inputs, keywordCount: Math.max(1, inputs.keywordCount) },
      snapshot,
    );
    if (probe.operations.rank.status !== "available") return null;
    return perUnit(probe.operations.rank.usageCostCents, probe.rank?.monthlyChecks ?? 0);
  }
  const operation =
    field === "researchCount" ? "research" : field === "domainCount" ? "domains" : "backlinks";
  const probe = estimateSeoMix({ ...inputs, [field]: 1 }, snapshot);
  const priced = probe.operations[operation];
  return priced.status === "available" ? priced.usageCostCents : null;
}
