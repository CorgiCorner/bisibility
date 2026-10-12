import type { Prisma } from "@/lib/generated/prisma/client";
import { meteringNamespace } from "@/lib/metering/runtime";
import { putSpendingBudget } from "@/lib/metering/spending-limit-store";
import { fundingSpendingBudgets } from "@/lib/metering/spending-limits";
import type { ProviderCatalogEntry, ProviderTestResult } from "@/lib/providers/types";
import { initialProviderAllocation } from "./initial-allocation";

/** Called once for a newly created connection in its creation transaction. */
export async function initializeConnectionBudgets(
  tx: Prisma.TransactionClient,
  connection: { id: string; provider: string },
  provider: ProviderCatalogEntry,
  verification?: ProviderTestResult,
  funding: "byok" | "platform" = "byok",
) {
  if (provider.allocation.kind !== "billable") return;
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
  for (const budget of budgets) await putSpendingBudget(tx, budget);
}
