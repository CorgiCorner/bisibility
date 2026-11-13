export function formatPromptUsd(amount: number, locale: string) {
  return new Intl.NumberFormat(locale, {
    currency: "USD",
    maximumFractionDigits: 4,
    style: "currency",
  }).format(amount);
}
