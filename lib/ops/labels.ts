import { getOpsConfig } from "@/lib/ops/config";

function tenantLabel(id: string, name: string | null | undefined): string {
  if (!getOpsConfig().includeNames || !name?.trim()) return id;
  return `${id} (${name.trim()})`;
}

export function keywordLabel(id: string, text?: string | null): string {
  return tenantLabel(id, text);
}

export function projectLabel(id: string, name?: string | null, domain?: string | null): string {
  if (!getOpsConfig().includeNames) return id;
  const human = domain?.trim() || name?.trim();
  return human ? `${human} [${id}]` : id;
}

export function ruleLabel(id: string, name?: string | null): string {
  return tenantLabel(id, name);
}

/** Keep deferred notifications and throttle keys on a fixed, non-tenant vocabulary. */
export function deferredReasonLabel(reason: string): string {
  const normalized = reason.trim().toLowerCase();
  if (normalized.includes("rate limit")) return "rate_limited";
  if (normalized.includes("budget")) return "budget_exhausted";
  if (normalized.includes("read-only") || normalized.includes("read only")) {
    return "project_read_only";
  }
  return "deferred";
}

const SAFE_DEDUPE_SEGMENT = /^[a-zA-Z0-9_-]+$/;

/** Only known identifier-based throttle keys may be echoed in the daily digest. */
export function suppressedEventLabel(dedupeKey: string): string {
  const segments = dedupeKey.split(":");
  if (
    segments.length !== 3 ||
    !["defer", "rank", "sync"].includes(segments[0] ?? "") ||
    segments.some((segment) => !SAFE_DEDUPE_SEGMENT.test(segment))
  ) {
    return "other";
  }
  return segments.join(":");
}
