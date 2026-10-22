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
  unit === "cents" || unit === "customer_cents" || unit === "budget_cents" || unit === "USD";

export const isZeroFigure = (value: Figure | "unlimited") =>
  typeof value !== "string" && value.certainty !== "unknown" && /^-?0(?:\.0+)?$/.test(value.text);

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
    const sourceText = isZeroFigure(value) ? "0" : value.text;
    const credits = isCreditUnit(value.unit);
    const money = isMoneyUnit(value.unit) && !credits;
    const currency = value.currency ?? "USD";
    const digits = credits
      ? 4
      : money
        ? moneyDigits
        : ["units", "requests", "paid_attempts"].includes(value.unit)
          ? 0
          : quantityDigits;
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
    if (
      money &&
      currencyDisplay &&
      moneyDigits === 2 &&
      (value.unit === "USD" ? /^0+\.00\d*[1-9]\d*$/ : /^0+\.\d*[1-9]\d*$/).test(sourceText)
    ) {
      const cent = (formatter.format as unknown as (text: string) => string)("0.01");
      return `< ${cent}`;
    }
    // Intl accepts decimal strings exactly; its TypeScript overload still omits them.
    const exact = formatter.format as unknown as (text: string) => string;
    return exact(
      money && currencyDisplay && value.unit !== "USD" ? majorUnits(sourceText) : sourceText,
    );
  };
  return {
    figure,
    budgetFigure: (value: UsagePresentationFigure) => {
      const text = figure(value);
      return text === null
        ? null
        : `${value.certainty === "estimated" && !isZeroFigure(value) ? "≈ " : ""}${text}`;
    },
    showCurrency: (unit: string) => currencyDisplay && isMoneyUnit(unit) && !isCreditUnit(unit),
  };
}
