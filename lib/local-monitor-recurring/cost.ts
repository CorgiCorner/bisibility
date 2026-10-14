import type { LocalQuote } from "@/lib/local-monitoring/quote";
/** Exact ceiling arithmetic only; canonical Meter remains the financial authority. */
export function exactCents(value: string) {
  if (!/^(?:0|[1-9]\d{0,39})(?:\.\d{1,18})?$/.test(value)) throw new Error("Invalid exact cents.");
  const [whole, fraction = ""] = value.split(".");
  return BigInt(whole) * 10n ** 18n + BigInt(fraction.padEnd(18, "0"));
}
export function formatCents(value: bigint, scale = 18) {
  if (value < 0n) throw new Error("Negative authority ceiling.");
  const whole = value / 10n ** BigInt(scale),
    fraction = String(value % 10n ** BigInt(scale))
      .padStart(scale, "0")
      .replace(/0+$/u, "");
  return String(whole) + (fraction ? "." + fraction : "");
}
export function recurringQuoteCents(quote: LocalQuote) {
  if (quote.nativeEstimates.some((row) => row.amount === null))
    throw new Error("Unknown quote cannot authorize a recurring purchase.");
  const cents = quote.nativeEstimates.filter((row) => row.unit === "cents");
  if (cents.length !== 1 || cents[0].amount === null)
    throw new Error("Exact native cents are unavailable.");
  exactCents(cents[0].amount);
  return cents[0].amount;
}

export function recurringCentsUsd(value: string) {
  return formatCents(exactCents(value), 20);
}
export function recurringUsdCents(value: string) {
  return formatCents(exactCents(value) * 100n);
}
