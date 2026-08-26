export type SpendTone = "exhausted" | "normal" | "warning";

export function spendTone(percent: number, hasAllocation: boolean): SpendTone {
  if (!hasAllocation) return "normal";
  if (percent >= 100) return "exhausted";
  if (percent >= 80) return "warning";
  return "normal";
}

export const spendFillClass: Record<SpendTone, string> = {
  exhausted: "bg-red",
  normal: "bg-accent",
  warning: "bg-yellow",
};

export const spendToneTextClass: Record<Exclude<SpendTone, "normal">, string> = {
  exhausted: "text-red-text",
  warning: "text-yellow-text",
};
