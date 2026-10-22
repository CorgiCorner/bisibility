import type { ActionPaymentQuote, PaymentAmount, PaymentUnit } from "./contract";
import { paymentAmountSchema } from "./schema";

/** Labels are supplied/localized by the capability; no provider or native-unit allowlist. */
export function formatPaymentUnit(unit: PaymentUnit): string {
  return unit.kind === "currency" ? unit.code : unit.plural;
}

const DISPLAY_FRACTION_DIGITS = new Set([0, 1, 2, 3, 4, 6]);

export type PaymentAmountDisplay = {
  moneyFractionDigits: number;
  quantityFractionDigits: number;
};

/** BigInt formats only the integer; the exact decimal tail is localized without Number coercion. */
function exactDecimal(
  value: string,
  unit: PaymentUnit,
  locale: string,
  fractionDigits?: number,
): string {
  const [integer, rawFraction = ""] = value.split(".");
  const options: Intl.NumberFormatOptions =
    unit.kind === "currency" ? { style: "currency", currency: unit.code } : {};
  const minimum =
    fractionDigits ??
    new Intl.NumberFormat(locale, options).resolvedOptions().minimumFractionDigits ??
    0;
  const fraction = rawFraction.replace(/0+$/, "").padEnd(minimum, "0");
  const digits = new Intl.NumberFormat(locale, { useGrouping: false });
  const localizedFraction = fraction.replace(/\d/g, (digit) => digits.format(Number(digit)));
  return new Intl.NumberFormat(locale, {
    ...options,
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })
    .formatToParts(BigInt(integer))
    .map((part) => {
      if (part.type === "fraction") return localizedFraction;
      if (part.type === "decimal" && !fraction) return "";
      return part.value;
    })
    .join("");
}

function displayDigits(display?: PaymentAmountDisplay) {
  if (
    !display ||
    !DISPLAY_FRACTION_DIGITS.has(display.moneyFractionDigits) ||
    !DISPLAY_FRACTION_DIGITS.has(display.quantityFractionDigits)
  ) {
    return null;
  }
  return display;
}

/** Half-up on the decimal string. Display rounding only; the stored amount stays exact. */
function roundDecimal(value: string, digits: number): string {
  const [whole = "0", fraction = ""] = value.split(".");
  if (fraction.length <= digits) return value;
  const head = digits === 0 ? "" : fraction.slice(0, digits);
  const roundUp = (fraction[digits] ?? "0") >= "5";
  const scaled = BigInt(`${whole}${head}`.replace(/^0+(?=\d)/, "")) + (roundUp ? 1n : 0n);
  if (digits === 0) return scaled.toString();
  const text = scaled.toString().padStart(digits + 1, "0");
  const nextWhole = text.slice(0, -digits);
  const nextFraction = text.slice(-digits).replace(/0+$/, "");
  return nextFraction ? `${nextWhole}.${nextFraction}` : nextWhole;
}

function quantityFloor(digits: number) {
  return digits === 0 ? "1" : `0.${"0".repeat(digits - 1)}1`;
}

/** One reusable amount for buttons, confirmation, results and retained history. */
export function formatPaymentAmount(
  amount: PaymentAmount,
  locale: string,
  display?: PaymentAmountDisplay,
): string {
  const parsed = paymentAmountSchema.safeParse(amount);
  if (!parsed.success || parsed.data.value === null) return "-";
  const { value, unit, certainty } = parsed.data;
  const digits = displayDigits(display);
  const rounded =
    digits === null
      ? value
      : roundDecimal(
          value,
          unit.kind === "currency" ? digits.moneyFractionDigits : digits.quantityFractionDigits,
        );
  const zero = /^0(?:\.0+)?$/.test(value);
  const shown = digits === null ? value : rounded;
  const minorDigits =
    unit.kind === "currency"
      ? (new Intl.NumberFormat(locale, { style: "currency", currency: unit.code }).resolvedOptions()
          .minimumFractionDigits ?? 0)
      : 0;
  const [integer, fraction = ""] = value.split(".");
  const underMinorUnit = !zero && integer === "0" && /^0*$/.test(fraction.slice(0, minorDigits));
  const minimumCurrency = minorDigits === 0 ? "1" : `0.${"0".repeat(minorDigits - 1)}1`;
  const quantityDigits = digits && unit.kind !== "currency" ? digits.quantityFractionDigits : null;
  const underQuantityFloor = quantityDigits !== null && !zero && /^0(?:\.0+)?$/.test(rounded);
  const minimumQuantity = quantityDigits === null ? value : quantityFloor(quantityDigits);
  const number =
    unit.kind === "currency" && underMinorUnit
      ? `< ${exactDecimal(minimumCurrency, unit, locale)}`
      : underQuantityFloor
        ? `< ${exactDecimal(minimumQuantity, unit, locale)}`
        : exactDecimal(
            shown,
            unit,
            locale,
            digits && unit.kind === "currency" ? digits.moneyFractionDigits : undefined,
          );
  const one = /^1(?:\.0+)?$/.test(underQuantityFloor ? minimumQuantity : shown);
  const label =
    unit.kind === "currency" ? number : `${number} ${one ? unit.singular : unit.plural}`;
  return `${certainty === "estimate" && !zero ? "≈ " : ""}${label}`;
}

/** The server supplies a maximum only when its existing execution guard enforces it. */
export function formatPaymentMaximum(
  maximum: NonNullable<ActionPaymentQuote["maximumCharge"]>,
  locale: string,
): string {
  return formatPaymentAmount({ ...maximum, certainty: "measured" }, locale);
}
