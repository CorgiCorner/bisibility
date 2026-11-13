export function formatPublicNumber(value: number, round: boolean, locale = "en"): string {
  if (!round) {
    return new Intl.NumberFormat(locale, { maximumFractionDigits: 0 }).format(value);
  }
  const formatted = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 1,
    notation: "compact",
  }).format(value);
  return locale.toLowerCase().startsWith("en")
    ? formatted.replaceAll("K", "k").replaceAll("M", "m").replaceAll("B", "b")
    : formatted;
}
