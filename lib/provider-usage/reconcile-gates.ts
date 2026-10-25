import type { Prisma } from "@/lib/generated/prisma/client";
import {
  currentBudgets,
  lockScopes,
  matchingScopes,
  saveBudget,
} from "@/lib/metering/store/budgets";
import { createSql } from "@/lib/metering/store/host-sql";
import type { Operation } from "@usagekit/core";
import { uncertaintyScopeUnknownCount } from "./uncertainty-gate-state";

/** The same scope lock excludes historical import and admission while a gate is superseded. */
export async function reconcileSpendingGates(tx: Prisma.TransactionClient, operation: Operation) {
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  const scopes = matchingScopes(operation).filter(
    (s) => s.kind === "group" || s.kind === "connection",
  );
  await lockScopes(sql, scopes);
  const budgets = await currentBudgets(sql, operation.scope.namespace, scopes);
  for (const budget of budgets.filter((b) => b.id.startsWith("unresolved:") && b.limit !== null)) {
    const scope = budget.scope;
    if (scope.kind !== "group" && scope.kind !== "connection")
      throw new Error("Invalid uncertainty gate");
    if ((await uncertaintyScopeUnknownCount(tx, scope.namespace, scope)) !== 0n) continue;
    const saved = await saveBudget(sql, { ...budget, version: budget.version + 1, limit: null });
    if (saved.outcome !== "saved") throw new Error("Uncertainty gate reconciliation conflict");
  }
}
