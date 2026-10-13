import type { Prisma } from "@/lib/generated/prisma/client";
import {
  currentBudgets,
  lockScopes,
  matchingScopes,
  saveBudget,
} from "@/lib/metering/store/budgets";
import { createSql, Prisma as SQL } from "@/lib/metering/store/host-sql";
import type { Operation } from "@usagekit/core";
import { finalReceiptJoin, unknownAccounting } from "./reconcile-state";

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
    const constraint =
      scope.kind === "group"
        ? SQL.sql`o.input->'scope'->>'group'=${scope.group}`
        : SQL.sql`o.input->'scope'->>'connection'=${scope.connection}`;
    const [row] = await tx.$queryRaw<{ unknown: bigint }[]>(SQL.sql`
      SELECT count(*) AS unknown FROM metering_operation o ${finalReceiptJoin}
      WHERE o.namespace=${scope.namespace} AND ${constraint} AND ${unknownAccounting}`);
    if (row?.unknown !== 0n) continue;
    const saved = await saveBudget(sql, { ...budget, version: budget.version + 1, limit: null });
    if (saved.outcome !== "saved") throw new Error("Uncertainty gate reconciliation conflict");
  }
}
