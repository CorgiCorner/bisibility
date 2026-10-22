import type { Certainty } from "@usagekit/core";
import type { Amount, Figure } from "@usagekit/views";
import type { UsageTone } from "./usage-motion";
import type { UsageTableLabels, UsageTableProps } from "./usage-table";

export const certaintyTone: Record<Certainty, UsageTone> = {
  measured: "positive",
  estimated: "neutral",
  unknown: "unknown",
};
export function usageTableFigure(
  value: Figure | Amount,
  labels: UsageTableLabels,
  props: Pick<UsageTableProps, "formatFigure" | "formatUnit">,
): string {
  if (value === "unavailable") return labels.unavailable;
  if (value.certainty === "unknown") return labels.unknown;
  return `${props.formatFigure?.(value) ?? value.text} ${props.formatUnit?.(value.unit) ?? (["customer_cents", "cents"].includes(value.unit) ? labels.cents : value.unit)}`;
}
