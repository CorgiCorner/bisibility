import type { BudgetStatus } from "@usagekit/core";
import type { BudgetRow } from "@usagekit/views";
import { budgetsViewFromStatuses } from "@usagekit/views";

/** Display projection carries public scope labels and exact figures, never storage identities. */
export function sharedBudgetRow(
  status: BudgetStatus,
  connection: string | null,
  figuresKnown: boolean,
): BudgetRow | undefined {
  if (status.redacted) return undefined;
  const target = connection ?? "project";
  const display: BudgetStatus = {
    ...status,
    budget: {
      ...status.budget,
      id: `${target}:${status.budget.surface}:${status.budget.unit}`,
      scope: connection
        ? { kind: "connection", namespace: "display", connection }
        : { kind: "group", namespace: "display", group: "project" },
    },
    epoch: { ...status.epoch, epoch: status.epoch.startsAt },
  };
  const row = budgetsViewFromStatuses([display]).rows[0];
  if (!row || figuresKnown) return row;
  return {
    ...row,
    used: "unavailable",
    reserved: "unavailable",
    remaining: row.limit === "unlimited" ? "unlimited" : "unavailable",
    alerts: [],
    warningAt: null,
    bar: null,
    level: "unavailable",
  };
}
