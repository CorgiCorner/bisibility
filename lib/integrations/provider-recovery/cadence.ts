import type { AccountAdapter } from "@/lib/providers/account-health/adapter";
import type { ProviderErrorCode } from "@/lib/providers/provider-error-code";

export const AUTO_CHECK_INCIDENT_REASONS = [
  "provider_billing",
  "provider_account_restricted",
  "provider_transient",
  "legacy_unverified",
] as const;

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;

export function autoCheckEligible(adapter: AccountAdapter | undefined, reason: string) {
  return Boolean(
    adapter?.probe.available &&
      adapter.check &&
      adapter.probe.cost === "non_billable" &&
      reason !== "provider_auth" &&
      adapter.probe.automaticRecheck.includes(reason as ProviderErrorCode | "legacy_unverified"),
  );
}

export function nextAccountCheck(input: {
  startedAt: Date;
  now: Date;
  attempt: number;
  retryAt?: Date | null;
  random?: number;
}): Date | null {
  const age = input.now.getTime() - input.startedAt.getTime();
  if (age >= 30 * DAY) return null;
  const intervals = [15 * MINUTE, 30 * MINUTE, 60 * MINUTE, 6 * 60 * MINUTE];
  const interval = age >= 7 * DAY ? DAY : intervals[Math.min(input.attempt, 3)];
  const jitter = 0.9 + 0.2 * (input.random ?? Math.random());
  const time = Math.max(input.now.getTime() + interval * jitter, input.retryAt?.getTime() ?? 0);
  return time < input.startedAt.getTime() + 30 * DAY ? new Date(time) : null;
}
