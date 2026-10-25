export {
  type LookupFailure,
  type LookupReason,
  lookupFailure,
  type Retry,
  type UnknownEvidence,
} from "@/lib/provider-evidence/recovery/outcomes";
export function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function array(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

export function nullableCostCents(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0
    ? Number((value * 100).toFixed(4))
    : null;
}

export function status(value: unknown) {
  const data = record(value);
  return {
    code: typeof data?.status_code === "number" ? data.status_code : null,
    message: typeof data?.status_message === "string" ? data.status_message : null,
  };
}
