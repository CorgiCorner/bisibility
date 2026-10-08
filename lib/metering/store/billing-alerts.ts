import type { BillingOperationChange, BudgetAlertCrossed } from "@usagekit/core";
import { alertKey, reachedAlerts } from "@usagekit/store";
import type { State } from "@usagekit/store/reference";
import { canonical } from "./codec";

export function recordBillingAlerts(state: State, changes: readonly BillingOperationChange[]) {
  const result: BudgetAlertCrossed[] = [];
  for (const { after } of changes)
    for (const epoch of after.budgetEpochs) {
      const budget = state.budgets.find(
        (b) =>
          b.scope.namespace === after.scope.namespace &&
          b.id === epoch.budgetId &&
          b.version === epoch.budgetVersion,
      );
      if (!budget?.alerts?.length || !state.readBudgetUsage) continue;
      const { used, reserved } = state.readBudgetUsage(budget, epoch.epoch);
      for (const at of reachedAlerts(budget, used, reserved)) {
        const id = canonical([after.scope.namespace, budget.id, epoch.epoch, alertKey(at)]);
        if (state.alerts.has(id)) continue;
        state.alerts.add(id);
        result.push({
          budgetId: budget.id,
          budgetVersion: budget.version,
          epoch: epoch.epoch,
          at,
          used,
          reserved,
        });
      }
    }
  return result;
}
