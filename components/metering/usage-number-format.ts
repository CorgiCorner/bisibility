import type { Figure } from "@usagekit/views";

export type UsagePresentationOptions = {
  moneyDisplay?: "currency" | "raw-unit";
  moneyFractionDigits?: number;
  quantityFractionDigits?: number;
};

export type UsagePresentationFigure = Exclude<Figure, "unavailable"> & {
  currency?: string;
};

export const isMoneyUnit = (unit: string) =>
  unit === "cents" || unit === "customer_cents" || unit === "budget_cents";

export const isCreditUnit = (unit: string) => unit === "customer_cents";

function precision(value = 2) {
  if (!Number.isInteger(value) || value < 0 || value > 20) {
    throw new RangeError("Usage display precision must be an integer from 0 to 20.");
  }
  return value;
}

/** Move the decimal point without converting an exact amount to a floating-point number. */
function majorUnits(text: string) {
  const negative = text.startsWith("-");
  const [integer, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const scale = fraction.length + 2;
  const digits = `${integer}${fraction}`.padStart(scale + 1, "0");
  return `${negative ? "-" : ""}${digits.slice(0, -scale)}.${digits.slice(-scale)}`;
}

type ExactNumberFormatOptions = Intl.NumberFormatOptions & {
  roundingMode?: "floor" | "halfExpand";
};

export function createUsageNumberFormat(locale: string, options: UsagePresentationOptions = {}) {
  const moneyDigits = precision(options.moneyFractionDigits);
  const quantityDigits = precision(options.quantityFractionDigits);
  const currencyDisplay = options.moneyDisplay !== "raw-unit";
  const formatters = new Map<string, Intl.NumberFormat>();
  const figure = (value: UsagePresentationFigure): string | null => {
    if (value.certainty === "unknown" || !/^-?\d+(?:\.\d+)?$/.test(value.text)) return null;
    const credits = isCreditUnit(value.unit);
    const money = isMoneyUnit(value.unit) && !credits;
    const currency = value.currency ?? "USD";
    const digits = credits ? 4 : money ? moneyDigits : quantityDigits;
    const roundingMode = value.certainty === "estimated" ? "floor" : "halfExpand";
    const key = `${money ? "money" : "quantity"}:${money && currencyDisplay ? currency : "decimal"}:${digits}:${roundingMode}`;
    let formatter = formatters.get(key);
    if (!formatter) {
      const formatOptions: ExactNumberFormatOptions = {
        minimumFractionDigits: money ? digits : 0,
        maximumFractionDigits: digits,
        roundingMode,
        ...(money && currencyDisplay ? { style: "currency", currency } : {}),
      };
      formatter = new Intl.NumberFormat(locale, formatOptions);
      formatters.set(key, formatter);
    }
    // Intl accepts decimal strings exactly; its TypeScript overload still omits them.
    const exact = formatter.format as unknown as (text: string) => string;
    return exact(money && currencyDisplay ? majorUnits(value.text) : value.text);
  };
  return {
    figure,
    showCurrency: (unit: string) => currencyDisplay && isMoneyUnit(unit) && !isCreditUnit(unit),
  };
}
