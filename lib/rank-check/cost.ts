export function positiveCostCents(value: unknown) {
  const cost = Number(value ?? 0);
  return Number.isFinite(cost) && cost > 0 ? cost : 0;
}

export function rankCheckCostCents(providerCost: unknown, connectionCost: unknown) {
  const reported = positiveCostCents(providerCost);
  return reported > 0 ? reported : positiveCostCents(connectionCost);
}
