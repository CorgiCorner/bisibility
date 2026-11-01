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
