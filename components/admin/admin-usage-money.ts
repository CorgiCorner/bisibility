/** Format exact micro-USD amounts without converting monetary integers to floats. */
export function formatRecordedUsd(units: string, locale: string) {
  const value = BigInt(units);
  const fraction = (value % 1_000_000n).toString().padStart(6, "0");
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 6,
    maximumFractionDigits: 6,
  })
    .formatToParts(value / 1_000_000n)
    .map((part) => (part.type === "fraction" ? fraction : part.value))
    .join("");
}

/** Two-decimal currency for tables. Exact micro-USD stays available from formatRecordedUsd. */
export function formatDisplayUsd(units: string, locale: string) {
  const value = BigInt(units);
  const negative = value < 0n;
  const magnitude = negative ? -value : value;
  if (magnitude > BigInt(Number.MAX_SAFE_INTEGER)) return formatRecordedUsd(units, locale);
  const cents = (magnitude + 5_000n) / 10_000n;
  const signed = negative && cents !== 0n ? -cents : cents;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(signed) / 100);
}
