import type { ProviderUsageStat } from "@/lib/settings/provider-usage-types";

export function formatUsdCents(cents: number, locale: string) {
  const dollars = cents / 100;
  const fractionDigits = Math.abs(dollars) < 100 ? 2 : 0;
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: fractionDigits,
    minimumFractionDigits: fractionDigits,
    style: "currency",
  }).format(dollars);
}

export function formatCount(value: number, locale: string) {
  return new Intl.NumberFormat(locale).format(value);
}

export type FeatureSourceBucket = {
  count: number;
  key: "app" | "api" | "sdk" | "cli" | "mcp";
  label: string;
  scheduled: number;
};

/** Buckets per-source request counts for the feature chips. */
export function featureSourceBuckets(
  stat: Pick<ProviderUsageStat, "bySource">,
  labels: Readonly<Record<"app" | "api" | "sdk" | "cli" | "mcp", string>>,
): FeatureSourceBucket[] {
  const buckets: Array<FeatureSourceBucket & { match: string[] }> = [
    { key: "app", label: labels.app, match: ["app", "worker", "unknown"] },
    { key: "api", label: labels.api, match: ["api"] },
    { key: "sdk", label: labels.sdk, match: ["sdk"] },
    { key: "cli", label: labels.cli, match: ["cli"] },
    { key: "mcp", label: labels.mcp, match: ["mcp"] },
  ].map((bucket) => ({
    ...bucket,
    key: bucket.key as FeatureSourceBucket["key"],
    count: 0,
    scheduled: 0,
  }));
  for (const entry of stat.bySource) {
    const bucket = buckets.find((candidate) => candidate.match.includes(entry.source));
    if (bucket) {
      bucket.count += entry.count;
      bucket.scheduled += entry.scheduled;
    }
  }
  return buckets
    .filter((bucket) => bucket.count > 0)
    .map((bucket) => ({
      count: bucket.count,
      key: bucket.key as FeatureSourceBucket["key"],
      label: bucket.label,
      scheduled: bucket.scheduled,
    }));
}

export type FeatureUsageDisplay =
  | {
      kind: "native";
      /** Confirmed native quantity (searches) for quota features. */
      quantity: number;
      requestCount: number;
      unconfirmedCount: number;
    }
  | { kind: "requests"; requestCount: number; unconfirmedCount: number }
  | { kind: "usd"; requestCount: number; unconfirmedCount: number; usdCents: number };

/**
 * Quota features show the measured native count, never a USD amount, and never
 * a quantity derived from configured depth. Unmeasured quota rows fall back to
 * a request count so the unconfirmed coverage stays explicit.
 */
export function featureUsageDisplay(
  stat: Pick<ProviderUsageStat, "costCents" | "count" | "quantity" | "unconfirmedCount">,
  unit: "cents" | "units",
): FeatureUsageDisplay {
  const requestCount = stat.count;
  const unconfirmedCount = stat.unconfirmedCount ?? 0;
  if (unit === "units") {
    return stat.quantity != null
      ? { kind: "native", quantity: stat.quantity, requestCount, unconfirmedCount }
      : { kind: "requests", requestCount, unconfirmedCount };
  }
  return { kind: "usd", requestCount, unconfirmedCount, usdCents: stat.costCents };
}

/**
 * A positive confirmed sum with unsettled requests is partial, not complete;
 * zero with unsettled requests must never read as a final "0 used".
 */
export function meterUnconfirmed(count: number | undefined) {
  const unconfirmedCount = count ?? 0;
  return { hasUnconfirmed: unconfirmedCount > 0, unconfirmedCount };
}
