import { addQuantity, type BudgetStatus } from "@usagekit/core";
import type { BudgetRow, Figure } from "@usagekit/views";
import { budgetsViewFromStatuses } from "@usagekit/views";

/**
 * How a budget reading may be shown. "estimated": the counter was read, but part of the
 * amount is still an admission estimate rather than a provider-measured receipt.
 */
export type BudgetFigures = "measured" | "estimated" | "unknown";

/** Boolean callers mean measured (true) or unknown (false). */
export type BudgetFiguresInput = boolean | BudgetFigures;

export function budgetFigures(value: BudgetFiguresInput): BudgetFigures {
  return value === true ? "measured" : value === false ? "unknown" : value;
}

/** Display projection carries public scope labels and exact figures, never storage identities. */
export function sharedBudgetRow(
  status: BudgetStatus,
  connection: string | null,
  figuresInput: BudgetFiguresInput,
  displayLabel?: string,
): BudgetRow | undefined {
  if (status.redacted) return undefined;
  const figures = budgetFigures(figuresInput);
  const target = connection ?? "project";
  // An estimate is one exposure figure: settled amounts plus still-unmeasured admissions.
  const exposure =
    figures === "estimated" && status.used && status.reserved
      ? {
          used: addQuantity(status.used, status.reserved),
          reserved: { ...status.reserved, value: 0n },
        }
      : {};
  const display: BudgetStatus = {
    ...status,
    ...exposure,
    budget: {
      ...status.budget,
      id: `${target}:${status.budget.surface}:${status.budget.unit}`,
      scope: connection
        ? { kind: "connection", namespace: "display", connection }
        : { kind: "group", namespace: "display", group: "project" },
    },
    epoch: { ...status.epoch, epoch: status.epoch.startsAt },
  };
  const projected = budgetsViewFromStatuses([display]).rows[0];
  const row = projected && displayLabel ? { ...projected, target: displayLabel } : projected;
  if (!row || figures === "measured") return row;
  if (figures === "estimated")
    return {
      ...row,
      used: estimated(row.used),
      reserved: estimated(row.reserved),
      remaining: estimated(row.remaining),
    };
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

function estimated<T extends BudgetRow["remaining"]>(value: T): T {
  if (typeof value === "string" || value.certainty === "unknown") return value;
  return { ...(value as Exclude<Figure, "unavailable">), certainty: "estimated" } as T;
}
