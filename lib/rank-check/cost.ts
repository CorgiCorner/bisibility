export function positiveCostCents(value: unknown) {
  const cost = Number(value ?? 0);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

export function rankCheckCostCents(providerCost: unknown, _connectionCost?: unknown) {
  if (providerCost === null || providerCost === undefined) return null;
  const cost = Number(providerCost);
  return Number.isFinite(cost) && cost >= 0 ? cost : null;
}
