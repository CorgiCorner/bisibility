export const COST_CURRENCIES = ["USD", "EUR", "GBP", "PLN", "JPY"] as const;
export type CostCurrency = (typeof COST_CURRENCIES)[number];

export function minorDigits(currency: string) {
  return currency === "JPY" ? 0 : 2;
}

export function majorToMinor(value: string, currency: string) {
  const digits = minorDigits(currency);
  const match = /^(\d+)(?:\.(\d+))?$/.exec(value.trim());
  if (!match) return null;
  const fraction = match[2] ?? "";
  if (fraction.length > digits) return null;
  const scale = 10 ** digits;
  const minor = Number(match[1]) * scale + Number(fraction.padEnd(digits, "0") || "0");
  return Number.isSafeInteger(minor) ? minor : null;
}

export function minorToMajor(minor: number, currency: string) {
  const digits = minorDigits(currency);
  const scale = 10 ** digits;
  const whole = Math.trunc(minor / scale);
  if (digits === 0) return String(whole);
  return `${whole}.${String(Math.abs(minor) % scale).padStart(digits, "0")}`;
}
