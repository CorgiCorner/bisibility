export function formatCount(value: number, locale: string) {
  return value.toLocaleString(locale);
}

export function formatDay(value: string, locale: string) {
  const [year, month, day] = value.split("-").map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat(locale, {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
    year: "numeric",
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

export function formatRevenue(minor: string, currency: string, locale: string) {
  const digits = currency.toUpperCase() === "JPY" ? 0 : 2;
  const negative = minor.startsWith("-");
  const body = (negative ? minor.slice(1) : minor).replace(/\D/g, "");
  const padded = body.padStart(Math.max(digits, 1), "0");
  const whole = digits === 0 ? padded : padded.slice(0, -digits);
  const fraction = digits === 0 ? "" : padded.slice(-digits);
  const amount = Number(`${negative ? "-" : ""}${whole || "0"}${fraction ? `.${fraction}` : ""}`);
  if (!Number.isFinite(amount)) return `${minor} ${currency}`;
  try {
    return new Intl.NumberFormat(locale, {
      currency,
      maximumFractionDigits: digits,
      minimumFractionDigits: digits,
      style: "currency",
    }).format(amount);
  } catch {
    return `${minor} ${currency}`;
  }
}
