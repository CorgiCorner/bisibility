import { formatQuantity } from "@usagekit/core";
import {
  allocationLimitFromAvailable,
  type Figure,
  type ProviderAllocationRow,
  parseProviderDecimal,
} from "@usagekit/views";
import { nativeCentsFromDollars, parseNativeAllocation } from "./form-schema";

export type AllocationRowIdentity = Pick<
  ProviderAllocationRow,
  "id" | "connectionId" | "fundingSource" | "surface" | "unit" | "revision"
>;
export type AllocationNativeObservation = {
  identity: AllocationRowIdentity;
  value: Figure;
  observedAt?: string;
  expiresAt?: string;
};
export type NativeAvailabilityReason =
  | "owner_only"
  | "usage_unavailable"
  | "balance_unavailable"
  | "balance_stale"
  | "balance_mismatch"
  | "budget_precision";
export type NativeAllocationRow = ProviderAllocationRow & {
  nativeObservation?: AllocationNativeObservation;
  availabilityReason?: NativeAvailabilityReason;
};
export function allocationIdentity(row: AllocationRowIdentity | null) {
  return row
    ? JSON.stringify([
        row.id,
        row.connectionId,
        row.fundingSource,
        row.surface,
        row.unit,
        row.revision,
      ])
    : "absent";
}
const unavailable = (reason: NativeAvailabilityReason) => ({
  outcome: "unavailable" as const,
  reason,
});

/** Native account evidence only suggests a draft; the normal server save owns cap validation. */
export function nativeAllocationAvailability(
  row: ProviderAllocationRow,
  observation: AllocationNativeObservation | null | undefined,
  now = Date.now(),
) {
  if ((row as NativeAllocationRow).availabilityReason === "owner_only")
    return unavailable("owner_only");
  if (row.fundingSource !== "byok" || !observation) return unavailable("balance_unavailable");
  if (allocationIdentity(observation.identity) !== allocationIdentity(row))
    return unavailable("balance_mismatch");
  const observed = Date.parse(observation.observedAt ?? "");
  const expires = Date.parse(observation.expiresAt ?? "");
  if (
    !Number.isFinite(observed) ||
    !Number.isFinite(expires) ||
    observed > now ||
    expires <= now ||
    expires <= observed
  )
    return unavailable("balance_stale");
  const value = observation.value;
  if (value === "unavailable" || value.certainty !== "measured")
    return unavailable("balance_unavailable");
  const native =
    value.unit === "USD" && row.unit === "cents"
      ? nativeCentsFromDollars(value.text, 18)
      : value.unit === "searches" && row.unit === "units"
        ? value.text
        : null;
  const parsed =
    native === null ? null : parseProviderDecimal(native, row.unit, row.unit === "units" ? 0 : 18);
  if (parsed?.outcome !== "valid") return unavailable("balance_mismatch");
  if (
    [row.used, row.reserved].some(
      (v) => v === "unavailable" || v.certainty !== "measured" || v.unit !== row.unit,
    )
  )
    return unavailable("usage_unavailable");
  const available = {
    text: formatQuantity(parsed.quantity),
    unit: row.unit,
    certainty: "measured" as const,
  };
  const next = {
    ...row,
    nativeObservation: observation,
    availabilityReason: undefined,
    available,
    availabilityBasis: "before_reservations" as const,
  };
  const proposal = allocationLimitFromAvailable(next);
  if (proposal.outcome !== "ready" || parseNativeAllocation(proposal.limit.text, row.unit) === null)
    return unavailable("budget_precision");
  let exceedsProviderBalance = false;
  if (
    !row.unlimited &&
    row.limit !== "unavailable" &&
    row.limit.certainty !== "unknown" &&
    row.limit.unit === row.unit &&
    row.used !== "unavailable" &&
    row.reserved !== "unavailable"
  ) {
    const inputs = [row.limit, row.used, row.reserved, available].map((v) =>
      parseProviderDecimal(v.text, row.unit, 18),
    );
    if (inputs.every((v) => v.outcome === "valid")) {
      const values = inputs.map((v) => {
        if (v.outcome !== "valid") throw new Error("Invalid native amount");
        return v.quantity;
      });
      const scale = Math.max(...values.map((v) => v.scale));
      const [limit = 0n, used = 0n, reserved = 0n, balance = 0n] = values.map(
        (v) => v.value * 10n ** BigInt(scale - v.scale),
      );
      exceedsProviderBalance = limit - used - reserved > balance - reserved;
    }
  }
  return {
    outcome: "ready" as const,
    row: next,
    limit: proposal.limit.text,
    exceedsProviderBalance,
  };
}
