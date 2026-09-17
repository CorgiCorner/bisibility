import type { StatusChipTone } from "@/components/ui/StatusChip";
import type { RankCheckRunPreview } from "@/lib/rank-check/runs/preview";

export type PreflightScope = {
  description: string;
  equation: string;
  startLabel: string;
  subtitle: string;
  title: string;
};

export type PreflightProvider = {
  id: string;
  label: string;
  note?: string;
  tooltip: string;
};

export type PreflightBlockCode = NonNullable<RankCheckRunPreview["budget"]["reason"]>;

export type PreflightBlockTone = StatusChipTone;

export function blockCodeFor(preview: RankCheckRunPreview, actionBlock: PreflightBlockCode | null) {
  return actionBlock ?? (preview.budget.blocked ? preview.budget.reason : null);
}

export function decisionLine(
  preview: RankCheckRunPreview,
  budgetBlocked: string,
  leftAfterLabel?: string,
) {
  if (preview.budget.reason === "budget_exhausted") return budgetBlocked;
  const duration =
    preview.targetCount <= 30 ? "~40s" : preview.targetCount <= 400 ? "~6 min" : "~9 min";
  return leftAfterLabel ?? duration;
}
