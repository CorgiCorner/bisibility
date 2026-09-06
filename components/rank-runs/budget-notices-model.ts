import type { BudgetNotice } from "./BudgetNotices";

type BudgetNoticeInput = {
  hasAllocation: boolean;
  maxUsedPercent: number | null;
  projectId: string;
};

function capPeriod(now = new Date()) {
  return now.toISOString().slice(0, 7);
}

export function exhaustedBudgetNotices({
  hasAllocation,
  maxUsedPercent,
  projectId,
}: BudgetNoticeInput): readonly BudgetNotice[] {
  if (!hasAllocation || maxUsedPercent === null || maxUsedPercent < 100) return [];
  return [
    {
      budgetSettingsHref: `/app/${projectId}/settings/usage?budget=edit`,
      capPeriod: capPeriod(),
      kind: "budget-exhausted",
    },
  ];
}

export function isBudgetExhausted({
  hasAllocation,
  maxUsedPercent,
}: Omit<BudgetNoticeInput, "projectId">) {
  return hasAllocation && maxUsedPercent !== null && maxUsedPercent >= 100;
}
