import { formatQuantity } from "@usagekit/core";
import { type ProviderAllocationRow, parseProviderDecimal } from "@usagekit/views";
import { z } from "zod";

const MAX_ALLOCATION = 2147483647n;
const MAX_RATE_SCALED = 9999999999n;

function bounded(text: string, unit: string, scale: number, maximum: bigint) {
  const parsed = parseProviderDecimal(text, unit, scale);
  if (parsed.outcome !== "valid") return null;
  const value = parsed.quantity;
  if (value.value * 10n ** BigInt(scale) > maximum * 10n ** BigInt(value.scale)) return null;
  return formatQuantity(value);
}

/** Native cents stay decimal text through validation and persistence. */
export function parseNativeRateCents(text: string): string | null {
  return bounded(text, "cents", 4, MAX_RATE_SCALED);
}

export function nativeCentsFromDollars(text: string, maximumScale = 6): string | null {
  const parsed = parseProviderDecimal(text, "USD", maximumScale);
  if (parsed.outcome !== "valid") return null;
  const quantity = parsed.quantity;
  return formatQuantity({ ...quantity, unit: "cents", value: quantity.value * 100n });
}

export function dollarsFromNativeCents(text: string, minimumDecimals = 2): string | null {
  // Decimal(10,4) native samples can produce a fifth digit in an exact even-sample median.
  const parsed = parseProviderDecimal(text, "cents", 5);
  if (parsed.outcome !== "valid") return null;
  const quantity = parsed.quantity;
  const dollars = formatQuantity({ ...quantity, scale: quantity.scale + 2, unit: "USD" });
  const [whole, fraction = ""] = dollars.split(".");
  return `${whole}.${fraction.padEnd(minimumDecimals, "0")}`;
}

export function parseNativeAllocation(text: string, unit: string): string | null {
  const amount = bounded(text, unit, 0, MAX_ALLOCATION);
  return amount !== null && BigInt(amount) > 0n ? amount : null;
}

export function allocationInputIssue(text: string, unit: string) {
  if (!text.trim()) return null;
  const monetary = unit === "cents";
  const parsed = monetary ? nativeCentsFromDollars(text, 2) : parseProviderDecimal(text, unit, 0);
  if (parsed === null || (typeof parsed !== "string" && parsed.outcome !== "valid")) {
    return monetary ? "invalidDecimal" : "wholeUnits";
  }
  const native = typeof parsed === "string" ? parsed : formatQuantity(parsed.quantity);
  if (parseNativeAllocation(native, unit) !== null) return null;
  const value = BigInt(native.split(".")[0] ?? "0");
  if (value > MAX_ALLOCATION) return "tooLarge";
  return monetary ? "positiveMoney" : "positiveUnits";
}

export function allocationFromInput(text: string, unit: string): string | null | undefined {
  if (!text.trim()) return null;
  const native = unit === "cents" ? nativeCentsFromDollars(text, 2) : text.trim();
  return native === null ? undefined : (parseNativeAllocation(native, unit) ?? undefined);
}

export function providerAllocationFormSchema(rows: readonly ProviderAllocationRow[]) {
  return z.object({ limits: z.record(z.string(), z.string()) }).superRefine((form, context) => {
    for (const row of rows) {
      const issue = allocationInputIssue(form.limits[row.id] ?? "", row.unit);
      if (issue) context.addIssue({ code: "custom", message: issue, path: ["limits", row.id] });
    }
  });
}

export type ProviderAllocationFormValues = { limits: Record<string, string> };
