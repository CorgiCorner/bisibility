import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import { estimatedRankCheckCostCents } from "@/lib/rank-check/default-cost";
import type { SerpDepth } from "@/lib/serp/constants";
import { pagesPerCheck } from "./estimate";
import type { CostRateInfo } from "./project-estimate";

export type NativeUsageUnit = "cents" | "units";
export type NativeUsageEstimate = {
  providerId: string | null;
  unit: NativeUsageUnit | null;
  quantity: number | null;
  unknownTargets: number;
};

export function nativeUsageUnit(providerId: string | null | undefined): NativeUsageUnit | null {
  const metadata = providerAllocationMetadata(providerId);
  return metadata?.kind === "billable" ? metadata.allocationUnit : metadata ? "cents" : null;
}

export function estimateRankUsage(
  depths: readonly SerpDepth[],
  rate: CostRateInfo,
): NativeUsageEstimate {
  const metadata = providerAllocationMetadata(rate.providerId);
  const unit = metadata?.kind === "billable" ? metadata.allocationUnit : metadata ? "cents" : null;
  const values = depths.map((depth) =>
    unit === "units"
      ? pagesPerCheck(depth)
      : metadata?.kind === "non_billable"
        ? 0
        : unit === "cents"
          ? estimatedRankCheckCostCents(
              rate.providerId ?? undefined,
              depth,
              rate.overrideCents,
              rate.rateContext ?? LIST_PROVIDER_RATE_CONTEXT,
            )
          : null,
  );
  const unknownTargets = values.filter((value) => value === null).length;
  return {
    providerId: rate.providerId,
    unit,
    quantity:
      unknownTargets > 0
        ? null
        : Number(values.reduce<number>((sum, value) => sum + (value ?? 0), 0).toFixed(6)),
    unknownTargets,
  };
}

export function combineUsageEstimates(
  estimates: readonly NativeUsageEstimate[],
): NativeUsageEstimate {
  const first = estimates[0];
  const compatible = estimates.every(
    (estimate) => estimate.unit === first?.unit && estimate.providerId === first?.providerId,
  );
  const known = compatible && estimates.every((estimate) => estimate.quantity !== null);
  return {
    providerId: compatible ? (first?.providerId ?? null) : null,
    unit: compatible ? (first?.unit ?? null) : null,
    quantity: known
      ? Number(estimates.reduce((sum, estimate) => sum + (estimate.quantity ?? 0), 0).toFixed(6))
      : null,
    unknownTargets: estimates.reduce((sum, estimate) => sum + estimate.unknownTargets, 0),
  };
}

export function nativeEstimateFromSelection(selection: unknown): NativeUsageEstimate | undefined {
  if (!selection || typeof selection !== "object" || !("nativeEstimate" in selection))
    return undefined;
  const estimate = selection.nativeEstimate as Partial<NativeUsageEstimate> | null;
  if (!estimate || typeof estimate !== "object") return undefined;
  if (estimate.unit !== null && estimate.unit !== "cents" && estimate.unit !== "units")
    return undefined;
  if (
    estimate.quantity !== null &&
    !(
      typeof estimate.quantity === "number" &&
      Number.isFinite(estimate.quantity) &&
      estimate.quantity >= 0
    )
  )
    return undefined;
  if (
    typeof estimate.unknownTargets !== "number" ||
    !Number.isInteger(estimate.unknownTargets) ||
    estimate.unknownTargets < 0
  )
    return undefined;
  if (estimate.providerId !== null && typeof estimate.providerId !== "string") return undefined;
  return estimate as NativeUsageEstimate;
}
