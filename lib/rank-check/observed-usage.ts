export type ObservedCheckCost = {
  costCents: number | { toString(): string } | null | undefined;
};

export type ObservedProviderCheckCost = ObservedCheckCost & {
  provider: string;
};

export type ObservedUsage = {
  averageCostCents: number | null;
  checkCount: number;
  totalCostCents: number;
};

export function aggregateObservedUsage(checks: readonly ObservedCheckCost[]): ObservedUsage {
  const costs = checks.flatMap((check) => {
    const cost = Number(check.costCents);
    return Number.isFinite(cost) && cost >= 0 ? [cost] : [];
  });
  const totalCostCents = Number(costs.reduce((total, cost) => total + cost, 0).toFixed(6));

  return {
    averageCostCents: costs.length ? Number((totalCostCents / costs.length).toFixed(6)) : null,
    checkCount: checks.length,
    totalCostCents,
  };
}

export function aggregateObservedUsageForProvider(
  checks: readonly ObservedProviderCheckCost[],
  provider: string,
) {
  return aggregateObservedUsage(checks.filter((check) => check.provider === provider));
}
