import "server-only";
import { ProviderAuthError } from "@/lib/providers/auth-error";
import { ProviderCallError } from "@/lib/providers/call-error";
import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";
import { ProviderRateLimitedError } from "@/lib/providers/rate-limit-error";
import type { ProviderCredentials } from "@/lib/providers/types";
import type { CapabilityScope } from "./types";

export type AccountFact =
  | { kind: "capacity"; value: number; unit: "usd" | "searches"; scope: CapabilityScope }
  | { kind: "failure"; code: ProviderErrorCode; scope: CapabilityScope; retryAfterMs?: number }
  | { kind: "not_verified"; scope: CapabilityScope };

export type AccountAdapter = {
  conditions: readonly ProviderErrorCode[];
  probe: {
    available: boolean;
    cost: "non_billable" | "unverified" | "unsupported";
    verifies: readonly ("authentication" | "access" | "capacity")[];
    automaticRecheck: readonly ProviderErrorCode[];
  };
  capacity: {
    unit: "usd" | "searches" | null;
    minimum(operation: { estimatedCostUsd?: number; searches?: number }): number | null;
  };
  classify(input: { status: number; body: unknown; scope: CapabilityScope }): AccountFact;
  classifyError(error: unknown, scope: CapabilityScope): AccountFact;
  check?: (credentials: ProviderCredentials, scope: CapabilityScope) => Promise<AccountFact>;
};

export function classifyTypedError(error: unknown, scope: CapabilityScope): AccountFact {
  const code =
    error instanceof ProviderAuthError
      ? "provider_auth"
      : error instanceof ProviderRateLimitedError
        ? "provider_rate_limited"
        : error instanceof ProviderCallError
          ? error.code
          : "provider_transient";
  return { kind: "failure", code, scope };
}

export function capacityReadiness(fact: AccountFact, minimum: number | null) {
  if (fact.kind !== "capacity" || minimum === null || !Number.isFinite(minimum) || minimum <= 0)
    return "not_verified";
  return fact.value >= minimum ? "ready" : "payment_required";
}

export function object(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function capacity(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

export async function probe(
  url: string,
  init: RequestInit,
  scope: CapabilityScope,
  classify: AccountAdapter["classify"],
): Promise<AccountFact> {
  try {
    const response = await fetch(url, { ...init, signal: AbortSignal.timeout(10_000) });
    const body: unknown = await response.json().catch(() => null);
    const fact = classify({ status: response.status, body, scope });
    const retryAfter = response.headers.get("retry-after");
    if (fact.kind === "failure" && retryAfter) {
      const seconds = Number(retryAfter);
      const delay = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(retryAfter) - Date.now();
      if (Number.isFinite(delay) && delay > 0) return { ...fact, retryAfterMs: delay };
    }
    return fact;
  } catch {
    return { kind: "failure", code: "provider_transient", scope };
  }
}
