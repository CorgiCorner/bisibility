import { createHash } from "node:crypto";
import { hostDefinitionAdapter } from "@/lib/measurement-definitions/host-adapters";
import type { HostPolicySnapshot } from "@/lib/measurement-definitions/host-policy-contract";
import type { ProviderRateContext } from "@/lib/provider-rates/resolver";
import type { RunSelectionKeyword } from "./selection";

type Source = {
  /** Required even for a blocked first-use preview; missing policy evidence cannot be signed. */
  measurementPolicy: HostPolicySnapshot;
  domain: string | null;
  stopOnMatch: boolean;
  rows: readonly RunSelectionKeyword[];
  depths: readonly number[];
  provider: {
    id?: string | null;
    provider: string;
    updatedAt?: Date;
    rateContext?: Pick<ProviderRateContext, "entries" | "manualAmountCents">;
  } | null;
};

function amountText(value: unknown) {
  return typeof value === "string" || typeof value === "number" || typeof value === "bigint"
    ? String(value)
    : null;
}

/** Bind target options even when a change leaves keyword IDs and total quoted cost unchanged. */
export function previewSourceHash({
  domain,
  stopOnMatch,
  rows,
  depths,
  provider,
  measurementPolicy,
}: Source) {
  if (!measurementPolicy) throw new Error("Measurement policy snapshot is required.");
  if (rows.length !== depths.length) throw new Error("Preview depths do not match target scope.");
  const targets = rows
    .map((row, index) => ({
      id: row.id,
      text: row.text,
      device: row.device ?? null,
      locationId: row.locationId,
      location: row.locationRef ?? null,
      depth: depths[index],
    }))
    .sort((a, b) => a.id.localeCompare(b.id));
  const capability = provider
    ? (hostDefinitionAdapter(provider.provider)?.capability ?? null)
    : null;
  return createHash("sha256")
    .update(
      JSON.stringify({
        definitionVersion: 2,
        measurementPolicy: measurementPolicy
          ? {
              state: measurementPolicy.state,
              policyEpoch: measurementPolicy.policyEpoch,
              config: measurementPolicy.config,
            }
          : null,
        domain,
        surface: "web_serp",
        stopOnMatch,
        capabilityVersion: capability?.capabilityVersion ?? null,
        adapterVersion: capability?.adapterVersion ?? null,
        provider: provider
          ? {
              id: provider.id ?? null,
              provider: provider.provider,
              updatedAt: provider.updatedAt?.toISOString() ?? null,
              pricing: provider.rateContext
                ? {
                    manualAmount: amountText(provider.rateContext.manualAmountCents),
                    entries: provider.rateContext.entries
                      .map((entry) => ({
                        cached: entry.cached,
                        failed: entry.failed,
                        createdAt: entry.createdAt.toISOString(),
                        cost: amountText(entry.costCents),
                        unitCost: amountText(entry.unitCostCents),
                      }))
                      .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b))),
                  }
                : null,
            }
          : null,
        targets,
      }),
    )
    .digest("hex");
}
