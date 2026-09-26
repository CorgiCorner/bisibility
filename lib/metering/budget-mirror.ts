import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import { allocationBudgets } from "./mapping";
import { meteringNamespace } from "./runtime";
import { lockScopes, saveBudget } from "./store/budgets";
import { createSql, Prisma as SqlPrisma } from "./store/sql";

export async function mirrorConnectionBudgetsSafely(
  tx: Prisma.TransactionClient,
  connectionId: string,
) {
  await tx.$executeRaw(SqlPrisma.sql`SAVEPOINT metering_shadow_allocation`);
  try {
    await mirrorConnectionBudgets(tx, connectionId);
  } catch {
    // Recover the SQL transaction as well as the exception, preserving the legacy mutation.
    await tx.$executeRaw(SqlPrisma.sql`ROLLBACK TO SAVEPOINT metering_shadow_allocation`);
    console.warn("[metering] allocation mirror failed", { connectionId });
  } finally {
    await tx.$executeRaw(SqlPrisma.sql`RELEASE SAVEPOINT metering_shadow_allocation`);
  }
}

export async function mirrorConnectionBudgets(tx: Prisma.TransactionClient, connectionId: string) {
  const connection = await tx.providerConnection.findUnique({
    where: { id: connectionId },
    select: {
      id: true,
      provider: true,
      allocationUnit: true,
      allocationAmountPerMonth: true,
      credentialSource: true,
      creditsAllocationAmountPerMonth: true,
      creditsProgrammaticAllocationAmountPerMonth: true,
      programmaticAllocationAmountPerMonth: true,
    },
  });
  if (!connection) return;
  const metadata = providerAllocationMetadata(connection.provider);
  if (metadata?.kind !== "billable") return;
  const namespace = meteringNamespace();
  const sql = createSql(tx, { statements: 0, changes: 0n, rowsRead: 0 });
  await lockScopes(sql, [{ kind: "connection", namespace, connection: connectionId }]);
  // Mirror the budget the connection is enforced against today: own keys and
  // credits keep separate budgets, and credits budgets are always cents.
  const hosted = connection.credentialSource === "hosted";
  const values = allocationBudgets(
    namespace,
    hosted
      ? {
          id: connection.id,
          unit: "cents",
          app: connection.creditsAllocationAmountPerMonth?.toString() ?? null,
          programmatic: connection.creditsProgrammaticAllocationAmountPerMonth?.toString() ?? null,
        }
      : {
          id: connection.id,
          unit: connection.allocationUnit ?? metadata.allocationUnit,
          app: connection.allocationAmountPerMonth?.toString() ?? null,
          programmatic: connection.programmaticAllocationAmountPerMonth?.toString() ?? null,
        },
    1,
  );
  for (const budget of values) {
    const [current] = await sql.query<{ version: number }>(
      SqlPrisma.sql`SELECT version FROM metering_budget WHERE namespace=${namespace} AND budget_id=${budget.id} ORDER BY version DESC LIMIT 1`,
    );
    const result = await saveBudget(sql, { ...budget, version: (current?.version ?? 0) + 1 });
    if (result.outcome !== "saved") throw new Error("Concurrent metering budget update");
  }
}
