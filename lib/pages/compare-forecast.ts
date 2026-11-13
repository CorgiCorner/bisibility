/**
 * Seam for a later forecast provider.
 *
 * The intended input is up to 16 months of daily values for the changed group,
 * ending on the last day of the comparison, and a horizon of at most 28 days.
 * The intended output is a frozen median plus a 10% to 90% band for each day
 * after the change. No model service ships in this version, so the read is null.
 */

export type CompareForecastPoint = {
  day: string;
  value: number;
};

export type CompareForecastInput = {
  history: readonly CompareForecastPoint[];
  horizonDays: number;
};

export type CompareForecastBand = {
  day: string;
  high: number;
  low: number;
  median: number;
};

export type CompareForecastResult = {
  bands: readonly CompareForecastBand[];
};

export type CompareForecastProvider = (
  input: CompareForecastInput,
) => Promise<CompareForecastResult | null>;

export async function getCompareForecast(input: CompareForecastInput): Promise<null> {
  void input;
  return null;
}
