import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { putSpendingBudget, readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import { fundingSpendingBudgets } from "@/lib/metering/spending-limits";
import type { ProviderCatalogEntry, ProviderTestResult } from "@/lib/providers/types";
import { initialProviderAllocation } from "./initial-allocation";

/** Initializes missing funding budgets in the caller transaction, preserving existing limits. */
export async function initializeConnectionBudgets(
  tx: Prisma.TransactionClient,
  connection: { id: string; provider: string },
  provider: ProviderCatalogEntry,
  verification?: ProviderTestResult,
  funding: "byok" | "platform" = "byok",
) {
  if (provider.allocation.kind !== "billable") return 0;
  const initial = initialProviderAllocation(provider, verification);
  const budgets = fundingSpendingBudgets(
    meteringNamespace(),
    {
      ...connection,
      unit: provider.allocation.allocationUnit,
      app:
        funding === "byok" && initial.allocationAmountPerMonth !== null
          ? String(initial.allocationAmountPerMonth)
          : null,
      programmatic: funding === "platform" ? "500" : null,
    },
    funding,
    1,
  );
  const existing = await readSpendingBudgets(tx, meteringNamespace(), [budgets[0].scope]);
  const missing = budgets.filter((budget) => !existing.some((current) => current.id === budget.id));
  for (const budget of missing) await putSpendingBudget(tx, budget);
  return missing.length;
}
