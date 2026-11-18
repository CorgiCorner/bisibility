import "server-only";
import { createHash } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import { putSpendingBudget, readSpendingBudgets } from "@/lib/metering/spending-limit-store";
import type { Budget, BudgetScope, BudgetWindow } from "@usagekit/core";

export type AssistantBudgetLimit = {
  scope: BudgetScope;
  window: BudgetWindow;
  microUsd: bigint;
  requests: bigint;
};

export function assistantBudgetId(scope: BudgetScope, unit: string): string {
  return `assistant:${createHash("sha256").update(JSON.stringify(scope)).digest("hex")}:${unit}`;
}

/** All limits are installed under the same scope locks that protect reservation. */
export async function syncAssistantBudgets(
  tx: Prisma.TransactionClient,
  limits: AssistantBudgetLimit[],
) {
  if (!limits.length || limits.some((l) => l.microUsd < 0n || l.requests < 0n)) {
    throw new Error("Invalid assistant budget configuration");
  }
  const namespace = limits[0]?.scope.namespace;
  if (!namespace || limits.some((l) => l.scope.namespace !== namespace)) {
    throw new Error("Assistant budget namespace mismatch");
  }
  const scopes = limits.map((limit) => limit.scope);
  if (new Set(scopes.map((scope) => JSON.stringify(scope))).size !== scopes.length) {
    throw new Error("Duplicate assistant budget scope");
  }
  const current = await readSpendingBudgets(tx, namespace, scopes);
  for (const limit of limits) {
    for (const [unit, value] of [
      ["usd_micro", limit.microUsd],
      ["requests", limit.requests],
    ] as const) {
      const id = assistantBudgetId(limit.scope, unit);
      const old = current.find((item) => item.id === id);
      const desired: Budget = {
        id,
        version: (old?.version ?? 0) + 1,
        scope: limit.scope,
        surface: "app",
        unit,
        limit: { unit, value, scale: 0 },
        window: limit.window,
        onExceed: "block",
      };
      if (
        old &&
        old.limit?.value === value &&
        old.limit.scale === 0 &&
        JSON.stringify(old.window) === JSON.stringify(limit.window) &&
        old.onExceed === "block" &&
        old.surface === "app"
      )
        continue;
      await putSpendingBudget(tx, desired);
    }
  }
}
