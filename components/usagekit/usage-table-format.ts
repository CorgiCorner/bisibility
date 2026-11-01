import type { Certainty } from "@usagekit/core";
import type { Amount, Figure } from "@usagekit/views";
import type { UsageTone } from "./usage-motion";

export const certaintyTone: Record<Certainty, UsageTone> = {
  measured: "positive",
  estimated: "neutral",
  unknown: "unknown",
};
export function usageTableFigure(
  value: Figure | Amount,
  labels: Record<"unavailable" | "unknown" | "cents", string>,
  props: {
    formatFigure?: (value: Exclude<Figure, "unavailable">) => string;
    formatUnit?: (unit: string, count?: string) => string;
  },
): string {
  if (value === "unavailable") return labels.unavailable;
  if (value.certainty === "unknown") return labels.unknown;
  return `${props.formatFigure?.(value) ?? value.text} ${props.formatUnit?.(value.unit, value.text) ?? (["customer_cents", "cents"].includes(value.unit) ? labels.cents : value.unit)}`;
}
