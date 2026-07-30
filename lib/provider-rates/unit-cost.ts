import type { ProviderFeatureRate } from "@/lib/cost-estimate/provider-rates";

export function normalizedProviderUnitCostCents(input: {
  costCents: number;
  includeClickstream?: boolean;
  itemCount: number;
  rate: ProviderFeatureRate | null;
}): number | null {
  if (!input.rate || input.rate.unitCostCents === undefined || input.itemCount <= 0) return null;
  const multiplier = input.includeClickstream ? 2 : 1;
  const baseCostCents = input.rate.baseCostCents ?? 0;
  const unitCostCents = (input.costCents / multiplier - baseCostCents) / input.itemCount;
  return Number.isFinite(unitCostCents) && unitCostCents > 0 ? unitCostCents : null;
}
