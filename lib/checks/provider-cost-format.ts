/** Display the confirmed native provider amount without rounding sub-cent receipts to zero. */
export function formatProviderCost(costCents: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(costCents / 100);
}
