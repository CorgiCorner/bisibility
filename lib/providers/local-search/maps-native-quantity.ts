import { addQuantity, formatQuantity, type Quantity } from "@usagekit/core";

/** Decimal native units stay exact across per-item quotes and full tasksets. */
export function sumMapsNative(rows: readonly (readonly Quantity[])[]) {
  const totals = new Map<string, Quantity>();
  for (const row of rows)
    for (const quantity of row) {
      const previous = totals.get(quantity.unit);
      totals.set(quantity.unit, previous ? addQuantity(previous, quantity) : quantity);
    }
  return [...totals.values()]
    .sort((a, b) => a.unit.localeCompare(b.unit))
    .map((quantity) => ({ unit: quantity.unit, amount: formatQuantity(quantity) }));
}
