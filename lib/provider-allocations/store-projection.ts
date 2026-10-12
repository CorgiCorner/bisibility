import { fundingBudgetId } from "@/lib/metering/spending-limits";
import type { Budget } from "@usagekit/core";
import { formatQuantity } from "@usagekit/core";
import type { ProviderAllocation, ProviderConnectionAllocations } from "./types";

/** Preserve the external whole-unit command contract; never round a Store limit into headroom. */
function externalLimit(budget: Budget | undefined): ProviderAllocation | null {
  if (!budget?.limit) return null;
  const text = formatQuantity(budget.limit);
  const amount = Number(text);
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    !["cents", "units", "customer_cents"].includes(budget.unit)
  )
    throw new Error("Spending limit cannot be represented by the allocation contract");
  return { amountPerMonth: amount, unit: budget.unit === "units" ? "units" : "cents" };
}
export function storeAllocations(
  budgets: readonly Budget[],
  connection: string,
): ProviderConnectionAllocations {
  const find = (funding: "byok" | "platform", surface: string) =>
    externalLimit(budgets.find((b) => b.id === fundingBudgetId(connection, funding, surface)));
  return {
    app: find("byok", "app"),
    programmatic: find("byok", "programmatic"),
    credits: { app: find("platform", "app"), programmatic: find("platform", "programmatic") },
  };
}
