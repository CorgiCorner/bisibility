import { formatMoneyCents } from "@/lib/format/money";

export const HEADER_SPEND_CAP_TOOLTIP = "Monthly provider budget.";

export function headerNoCapLabel(spentCents: number): string {
  if (spentCents > 0) {
    return `${formatMoneyCents(spentCents)} · no budget · Set one`;
  }
  return "No budget · Set one";
}

export function headerNoCapAriaLabel(spentCents: number): string {
  if (spentCents > 0) {
    return `${formatMoneyCents(spentCents)} spent with no budget, set one`;
  }
  return "No budget, set one";
}
