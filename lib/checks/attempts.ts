import { rateForProvider } from "@/lib/cost-estimate/provider-rates";
import type { CheckAttempt, CheckAttemptOutcome } from "./contract";

type JsonRecord = Record<string, unknown>;

const ATTEMPT_OUTCOMES = new Set<CheckAttemptOutcome>([
  "credentials_unavailable",
  "ok",
  "provider_failed",
  "rate_limited",
]);

function recordFor(value: unknown): JsonRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : null;
}

function stringFor(...values: unknown[]) {
  return values.find((value): value is string => typeof value === "string" && value.length > 0);
}

function numberFor(...values: unknown[]) {
  const value = values.find(
    (candidate) =>
      (typeof candidate === "number" ||
        (typeof candidate === "string" && candidate.trim().length > 0)) &&
      Number.isFinite(Number(candidate)),
  );
  return value === undefined ? null : Number(value);
}

export function providerLabel(provider: string) {
  const known = rateForProvider(provider);
  if (known) return known.label;
  return (
    provider
      .split(/[-_]/)
      .filter(Boolean)
      .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
      .join(" ") || "Unknown"
  );
}

function inferredOutcome(record: JsonRecord, detail: string | null): CheckAttemptOutcome {
  const stored = stringFor(record.outcome, record.code);
  if (stored && ATTEMPT_OUTCOMES.has(stored as CheckAttemptOutcome)) {
    return stored as CheckAttemptOutcome;
  }
  if (stored === "provider_rate_limited") return "rate_limited";

  const normalized = `${stored ?? ""} ${detail ?? ""}`.toLowerCase();
  if (normalized.includes("rate limit") || normalized.includes("429")) {
    return "rate_limited";
  }
  if (normalized.includes("credential")) {
    return "credentials_unavailable";
  }
  return "provider_failed";
}

function parseAttempt(value: unknown): CheckAttempt | null {
  const record = recordFor(value);
  if (!record) return null;

  const provider = stringFor(record.provider, record.providerId, record.provider_id) ?? "unknown";
  const detail = stringFor(record.detail, record.message, record.error) ?? null;

  return {
    costCents: numberFor(record.costCents, record.cost_cents),
    degradedToCountry: record.degradedToCountry === true || record.degraded_to_country === true,
    detail,
    durationMs: numberFor(record.durationMs, record.duration_ms),
    outcome: inferredOutcome(record, detail),
    provider,
    providerLabel:
      stringFor(record.providerLabel, record.provider_label) ?? providerLabel(provider),
  };
}

export function parseCheckAttempts(value: unknown): CheckAttempt[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((attempt) => {
    const parsed = parseAttempt(attempt);
    return parsed ? [parsed] : [];
  });
}

export function completedCheckAttempts(value: unknown, finalProvider: string): CheckAttempt[] {
  const attempts = parseCheckAttempts(value);
  const last = attempts.at(-1);
  if (last?.outcome === "ok" && last.provider === finalProvider) {
    return attempts;
  }

  return [
    ...attempts,
    {
      costCents: null,
      degradedToCountry: false,
      detail: null,
      durationMs: null,
      outcome: "ok",
      provider: finalProvider,
      providerLabel: providerLabel(finalProvider),
    },
  ];
}

export function completedViaFallback(attempts: readonly CheckAttempt[], finalProvider: string) {
  let finalOkIndex = -1;
  for (let index = attempts.length - 1; index >= 0; index -= 1) {
    if (attempts[index]?.outcome === "ok") {
      finalOkIndex = index;
      break;
    }
  }
  if (finalOkIndex < 0) return false;

  const firstProvider = attempts[0]?.provider;
  return (
    attempts.slice(0, finalOkIndex).some((attempt) => attempt.outcome !== "ok") ||
    (firstProvider !== undefined && firstProvider !== finalProvider)
  );
}

export function deriveCheckAttemptSummary(value: unknown, finalProvider: string, status: string) {
  const attempts =
    status === "completed"
      ? completedCheckAttempts(value, finalProvider)
      : parseCheckAttempts(value);

  return {
    attemptCount: attempts.length,
    degradedToCountry: attempts.some((attempt) => attempt.degradedToCountry),
    viaFallback: status === "completed" && completedViaFallback(attempts, finalProvider),
  };
}
