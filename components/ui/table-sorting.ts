import { compareQuantity, type Quantity } from "@usagekit/core";
import type { DataTableSort } from "./data-table/data-table-types";

export type TableSortValue = string | number | bigint | Quantity | null | undefined;
const textOrder = new Intl.Collator(undefined, { numeric: true, sensitivity: "base" });

/** Keep decimal precision, including amounts above Number.MAX_SAFE_INTEGER. */
export function decimalSortValue(text: string, unit = "value"): Quantity | undefined {
  if (!/^-?\d+(?:\.\d+)?$/.test(text)) return undefined;
  const [integer, fraction = ""] = text.split(".");
  return { value: BigInt(integer + fraction), scale: fraction.length, unit };
}

function compareValues(
  a: Exclude<TableSortValue, null | undefined>,
  b: Exclude<TableSortValue, null | undefined>,
) {
  if (typeof a === "object" && typeof b === "object") {
    return a.unit === b.unit ? compareQuantity(a, b) : textOrder.compare(a.unit, b.unit);
  }
  if (typeof a === "object" && b === Number.POSITIVE_INFINITY) return -1;
  if (a === Number.POSITIVE_INFINITY && typeof b === "object") return 1;
  if (typeof a === "object" || typeof b === "object") {
    const unit = typeof a === "object" ? a.unit : typeof b === "object" ? b.unit : "value";
    const left = typeof a === "object" ? a : decimalSortValue(String(a), unit);
    const right = typeof b === "object" ? b : decimalSortValue(String(b), unit);
    return left && right ? compareQuantity(left, right) : 0;
  }
  if (typeof a === "string" || typeof b === "string")
    return textOrder.compare(String(a), String(b));
  return a < b ? -1 : a > b ? 1 : 0;
}

export function sortTableRows<T>(
  rows: readonly T[],
  sorting: DataTableSort | null,
  value: (row: T, field: string) => TableSortValue,
): T[] {
  if (!sorting) return [...rows];
  return [...rows].sort((a, b) => {
    const left = value(a, sorting.field);
    const right = value(b, sorting.field);
    if (left == null) return right == null ? 0 : 1;
    if (right == null) return -1;
    return compareValues(left, right) * (sorting.direction === "asc" ? 1 : -1);
  });
}
