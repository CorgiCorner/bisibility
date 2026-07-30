/**
 * Amounts below $100 use two decimals; $100+ deliberately rounds to whole dollars.
 */
export function formatMoneyCents(cents: number): string {
  if (cents < 0) {
    return `-${formatMoneyCents(-cents)}`;
  }
  const dollars = cents / 100;
  if (dollars < 100) {
    return `$${dollars.toFixed(2)}`;
  }
  return `$${Math.round(dollars).toLocaleString("en-US")}`;
}
