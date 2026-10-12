import type { Budget, Operation } from "@usagekit/core";
import { resolveWindow, sourcesOf } from "@usagekit/core";
import { matchingScopes } from "./budgets";
import { canonical, effective } from "./codec";

export function validateHistoricalOperation(op: Operation) {
  if (op.lease || !["pending", "settled", "released"].includes(op.state) || !op.receipts.length)
    throw new Error("Historical import requires inactive original evidence");
  if (!Number.isSafeInteger(op.version) || op.version < 1)
    throw new Error("Invalid historical operation version");
  for (const date of [op.createdAt, op.updatedAt, op.reservationExpiresAt])
    if (!Number.isFinite(Date.parse(date))) throw new Error("Invalid historical timestamp");
  const seen = new Set<string>();
  for (const receipt of op.receipts) {
    if (
      !receipt.id ||
      seen.has(receipt.id) ||
      (receipt.supersedes && !seen.has(receipt.supersedes))
    )
      throw new Error("Conflicting historical receipt lineage");
    seen.add(receipt.id);
    const units = new Set<string>();
    for (const measurement of receipt.measurements) {
      if (units.has(measurement.unit)) throw new Error("Duplicate historical measurement");
      units.add(measurement.unit);
      const q = measurement.quantity;
      if (
        q &&
        (q.unit !== measurement.unit ||
          q.value < 0n ||
          !Number.isSafeInteger(q.scale) ||
          q.scale < 0 ||
          q.scale > 18)
      )
        throw new Error("Invalid historical quantity");
    }
    if (receipt.cost.money && receipt.cost.money.units < 0n)
      throw new Error("Invalid historical provider cost");
  }
  if (op.state === "settled" && effective(op)?.measurements.some((m) => m.quantity === null))
    throw new Error("Unknown history must remain pending");
}
export function applies(op: Operation, budget: Budget) {
  return (
    matchingScopes(op).some((s) => canonical(s) === canonical(budget.scope)) &&
    ["any", op.surface, op.source, ...sourcesOf(op.surface)].includes(budget.surface)
  );
}
export function originalEpoch(op: Operation, budget: Budget) {
  const window = resolveWindow(budget.window, new Date(op.createdAt));
  return { budgetId: budget.id, budgetVersion: budget.version, ...window };
}
export function validateEpochs(op: Operation, budgets: Budget[]) {
  const seen = new Set<string>();
  for (const epoch of op.budgetEpochs) {
    const budget = budgets.find(
      (b) => b.id === epoch.budgetId && b.version === epoch.budgetVersion,
    );
    if (
      !budget ||
      !applies(op, budget) ||
      seen.has(epoch.budgetId) ||
      canonical(epoch) !== canonical(originalEpoch(op, budget))
    )
      throw new Error("Invalid historical budget epoch");
    seen.add(epoch.budgetId);
  }
}
