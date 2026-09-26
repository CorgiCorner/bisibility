import type { Quantity } from "@usagekit/core";
export function exactAmount(value: bigint, scale: number) {
  const sign = value < 0n ? "-" : "";
  const digits = (value < 0n ? -value : value).toString().padStart(scale + 1, "0");
  return sign + (scale ? `${digits.slice(0, -scale)}.${digits.slice(-scale)}` : digits);
}
export function quantityLabel(quantity: Quantity | null) {
  return quantity ? `${exactAmount(quantity.value, quantity.scale)} ${quantity.unit}` : null;
}
