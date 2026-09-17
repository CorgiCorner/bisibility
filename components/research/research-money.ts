export function formatResearchEstimateCents(
  cents: number,
  formatNumber: (value: number, options?: Intl.NumberFormatOptions) => string,
) {
  const absoluteCents = Math.abs(cents);
  const currencyOptions = {
    currency: "USD",
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    style: "currency",
  } as const;
  if (absoluteCents > 0 && absoluteCents < 1) {
    return `${cents < 0 ? "-" : ""}< ${formatNumber(0.01, currencyOptions)}`;
  }
  return formatNumber(cents / 100, currencyOptions);
}
