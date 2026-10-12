import {
  estimatedFeatureCostCents,
  type ProviderFeatureRate,
} from "@/lib/cost-estimate/provider-rates";
import type { ResolveProviderRateInput } from "@/lib/provider-rates/resolver";
import type { ProviderHistoryWindow } from "@/lib/providers/history-window";

export function requiredEstimatedCostCents(input: {
  context: Pick<ResolveProviderRateInput, "entries" | "manualAmountCents">;
  includeClickstream?: boolean;
  historyWindow?: ProviderHistoryWindow;
  itemCount: number;
  providerId: string;
  rate: ProviderFeatureRate | null;
}) {
  const amountCents = estimatedFeatureCostCents(
    input.rate,
    input.itemCount,
    input.includeClickstream ?? false,
    input.context,
  );
  if (amountCents === null) {
    throw new Error(`No rate configured for provider ${input.providerId}.`);
  }
  return amountCents;
}
