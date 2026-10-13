export type TransportFenceProvenance = "none" | "legacy_unknown" | "utc_iso_v1";

/** Presence is send authority evidence; a legacy instant remains explicitly unknown. */
export function projectTransportFence(row: {
  transportFenced: boolean;
  fenced_at_iso: string | null;
  transportFenceEpochMs: string | null;
}) {
  if (typeof row.transportFenced !== "boolean") throw new Error("Invalid transport fence presence");
  if (!row.transportFenced && (row.fenced_at_iso !== null || row.transportFenceEpochMs !== null))
    throw new Error("Unfenced transport has timestamp evidence");
  if (row.transportFenced && row.transportFenceEpochMs === null)
    throw new Error("Fenced transport is missing its physical value");
  if (row.fenced_at_iso !== null) {
    const iso = row.fenced_at_iso,
      physical = row.transportFenceEpochMs;
    if (
      !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(iso) ||
      !Number.isFinite(Date.parse(iso)) ||
      new Date(iso).toISOString() !== iso
    )
      throw new Error("Invalid transport fence timestamp evidence");
    if (
      !physical ||
      !/^-?\d+(?:\.0+)?$/.test(physical) ||
      BigInt(Date.parse(iso)) !== BigInt(physical.split(".")[0])
    )
      throw new Error("Transport fence physical instant differs from original ISO evidence");
  }
  const transportFenceProvenance: TransportFenceProvenance = !row.transportFenced
    ? "none"
    : row.fenced_at_iso === null
      ? "legacy_unknown"
      : "utc_iso_v1";
  return {
    transportFenced: row.transportFenced,
    transportFenceProvenance,
    transportFenceInstant: row.fenced_at_iso,
  };
}
