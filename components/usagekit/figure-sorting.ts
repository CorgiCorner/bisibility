import { decimalSortValue } from "@/components/ui/table-sorting";
import type { Figure, Limit } from "@usagekit/views";

export function figureSortValue(value: Figure | Limit | null | undefined) {
  if (value === "unlimited") return Number.POSITIVE_INFINITY;
  if (!value || value === "unavailable" || value.certainty === "unknown") return undefined;
  return decimalSortValue(value.text, value.unit);
}
