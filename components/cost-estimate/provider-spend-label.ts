export function formatProviderBudgetUsedLabel(usedPercent: number): string {
  if (usedPercent > 0 && usedPercent < 1) {
    return "<1% used";
  }
  return `${Math.round(usedPercent)}% used`;
}
