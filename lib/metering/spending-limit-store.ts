import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Budget, BudgetScope } from "@usagekit/core";
import { currentBudgets, lockScopes, saveBudget } from "./store/budgets";
import { createSql } from "./store/sql";

const sqlFor = (tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">) =>
  createSql(tx as Prisma.TransactionClient, { statements: 0, changes: 0n, rowsRead: 0 });

export async function readSpendingBudgets(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  namespace: string,
  scopes: BudgetScope[],
  mode: "read" | "mutation" = "mutation",
) {
  const sql = sqlFor(tx);
  if (mode === "mutation") await lockScopes(sql, scopes);
  return currentBudgets(sql, namespace, scopes);
}
/** Caller supplies the reviewed version; CAS never retries a stale financial command. */
export async function putSpendingBudget(
  tx: Pick<Prisma.TransactionClient, "$queryRaw" | "$executeRaw">,
  budget: Budget,
) {
  const result = await saveBudget(sqlFor(tx), budget);
  if (result.outcome !== "saved") throw new Error("Concurrent spending limit update");
  return result.budget;
}
