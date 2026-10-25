import type { ProviderRateLimitScope } from "@/lib/providers/rate-limit-error";

export type GoogleApiErrorPayload = {
  error?: {
    code?: unknown;
    details?: unknown;
    errors?: unknown;
    message?: unknown;
    status?: unknown;
  };
};

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function objectEntries(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter(isObject) : [];
}

function text(value: unknown): string {
  return typeof value === "string" ? value.toLowerCase() : "";
}

function period(value: unknown): ProviderRateLimitScope {
  const name = text(value).replace(/[^a-z]/g, "");
  if (name.includes("perday") || name.includes("daily")) return "daily";
  if (name.includes("perminute")) return "minute";
  return "unknown";
}

export function googleRateLimitScope(
  payload: GoogleApiErrorPayload | null,
): ProviderRateLimitScope {
  const metadata = objectEntries(payload?.error?.details).flatMap((detail) =>
    isObject(detail.metadata) ? [detail.metadata] : [],
  );
  // A named but unrecognized quota must not become a minute limit via the legacy reason.
  const names = metadata.flatMap((entry) => [entry.quota_limit, entry.quota_metric]);
  const scopes = names.map(period);
  if (scopes.includes("daily")) return "daily";
  if (scopes.includes("minute")) return "minute";
  const signals = [
    ...objectEntries(payload?.error?.errors).map((error) => text(error.reason)),
    text(payload?.error?.status),
  ];
  if (signals.some((signal) => signal.includes("daily"))) return "daily";
  if (names.some((name) => text(name).trim())) return "unknown";
  if (signals.some((signal) => signal.includes("ratelimitexceeded") || signal.includes("minute"))) {
    return "minute";
  }
  return "unknown";
}

export function googleRetryAfterMs(payload: GoogleApiErrorPayload | null): number | undefined {
  for (const detail of objectEntries(payload?.error?.details)) {
    if (detail["@type"] !== "type.googleapis.com/google.rpc.RetryInfo") continue;
    if (typeof detail.retryDelay !== "string" || !/^\d+(?:\.\d{1,9})?s$/.test(detail.retryDelay)) {
      continue;
    }
    const milliseconds = Math.ceil(Number(detail.retryDelay.slice(0, -1)) * 1000);
    if (Number.isSafeInteger(milliseconds)) return milliseconds;
  }
  return undefined;
}
