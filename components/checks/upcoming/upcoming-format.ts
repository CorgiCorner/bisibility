import type { UpcomingBlockedGroup, UpcomingBlockReason } from "@/lib/checks/contract";
import type { DateDisplayContext } from "@/lib/dates/format";
import { formatDisplayDateRange } from "@/lib/dates/format";
import { centsToDollars } from "@/lib/format/currency";

export type NativeUsageTextSource = {
  quantity: number | null;
  unit: "cents" | "units" | null;
} | null;

export function formatCount(count: number, locale: string) {
  return new Intl.NumberFormat(locale).format(count);
}

function formatCurrency(cents: number, locale: string, minimumFractionDigits: number) {
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits,
    style: "currency",
  }).format(centsToDollars(cents));
}

export function formatEstimatedAmount(cents: number, locale: string) {
  return formatCurrency(cents > 0 && cents < 1 ? 1 : cents, locale, 2);
}

/**
 * Message parameters for an estimate label. A provider-native estimate (quota operations
 * or metered cents) always wins; the legacy cents amount is a compatibility fallback for
 * views that never received one. Never converts quota operations into dollars.
 */
export function upcomingAmountParts(
  cents: number,
  native: NativeUsageTextSource,
  locale: string,
  formatUsage: (estimate: NativeUsageTextSource) => string,
) {
  if (native) {
    return { amount: formatUsage(native), isLessThanCent: "false" as const };
  }
  return {
    amount: formatEstimatedAmount(cents, locale),
    isLessThanCent: String(cents > 0 && cents < 1) as "true" | "false",
  };
}

export function formatCap(cents: number, locale: string) {
  return formatCurrency(cents, locale, 0);
}

export function formatForecastDate(isoDate: string, dateDisplay: DateDisplayContext) {
  const key = isoDate.slice(0, 10);
  return formatDisplayDateRange(key, key, dateDisplay);
}

export function findBlockedGroup(blocked: UpcomingBlockedGroup[], reason: UpcomingBlockReason) {
  return blocked.find((group) => group.reason === reason);
}
