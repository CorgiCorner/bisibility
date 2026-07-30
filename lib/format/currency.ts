const CENT_PRECISION = 4;
const DOLLAR_PRECISION = 6;

function rounded(value: number, precision: number) {
  const result = Number(value.toFixed(precision));
  return Object.is(result, -0) ? 0 : result;
}

export function centsToDollars(cents: number): number {
  return rounded(cents / 100, DOLLAR_PRECISION);
}

export function dollarsToCents(dollars: number): number {
  return rounded(dollars * 100, CENT_PRECISION);
}
