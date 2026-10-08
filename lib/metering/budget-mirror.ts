import "server-only";
import type { Prisma } from "@/lib/generated/prisma/client";
import { ownAllocationTag } from "@/lib/provider-usage/credential-version";
import { providerAllocationMetadata } from "@/lib/providers/allocation-metadata";
import { readDeploymentMeteringAllocationAuthority } from "@/lib/providers/execution-extension";
import { allocationBudgets } from "./mapping";
import { meteringNamespace } from "./runtime";
import { lockScopes, saveBudget } from "./store/budgets";
import { createSql, Prisma as SqlPrisma } from "./store/sql";

/** Serialize connection edits with activation/rollback even when shadow observation is off. */
export async function guardConnectionBudgetMutation(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  connectionId: string,
) {
  const authority = await readDeploymentMeteringAllocationAuthority(
    tx,
    meteringNamespace(),
    connectionId,
  );
  if (authority === "draining")
    throw new Error("Metering allocation mutation awaits rollback reconciliation");
  return authority;
}

/** Changing upstream funding requires a drained epoch; an active budget cannot follow a new key. */
export async function guardConnectionFundingMutation(
  tx: Pick<Prisma.TransactionClient, "$queryRaw">,
  connectionId: string,
) {
  if ((await guardConnectionBudgetMutation(tx, connectionId)) === "active")
    throw new Error("Active metering funding source cannot change before rollback");
}

export async function mirrorConnectionBudgetsSafely(
  tx: Prisma.TransactionClient,
  connectionId: string,
) {
  const authority = await guardConnectionBudgetMutation(tx, connectionId);
  if (authority === "active") {
    // A financial limit is authoritative: a failed mirror must abort the entire mutation.
    await mirrorConnectionBudgets(tx, connectionId, authority);
    return;
  }
  if (process.env.METERING_SHADOW !== "on") return;
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

export async function mirrorConnectionBudgets(
  tx: Prisma.TransactionClient,
  connectionId: string,
  authority?: "legacy" | "active",
) {
  authority ??= await guardConnectionBudgetMutation(tx, connectionId);
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
          unit: "customer_cents",
          app: connection.creditsAllocationAmountPerMonth?.toString() ?? null,
          programmatic: connection.creditsProgrammaticAllocationAmountPerMonth?.toString() ?? null,
        }
      : {
          id: connection.id,
          unit: connection.allocationUnit ?? metadata.allocationUnit,
          allocationTag: ownAllocationTag(connection.provider, connection.id),
          app: connection.allocationAmountPerMonth?.toString() ?? null,
          programmatic: connection.programmaticAllocationAmountPerMonth?.toString() ?? null,
        },
    1,
  );
  for (const budget of values) {
    const [current] = await sql.query<{ version: number }>(
      SqlPrisma.sql`SELECT version FROM metering_budget WHERE namespace=${namespace} AND budget_id=${budget.id} ORDER BY version DESC LIMIT 1`,
    );
    const result = await saveBudget(sql, {
      ...budget,
      onExceed: authority === "active" ? "block" : "allow",
      version: (current?.version ?? 0) + 1,
    });
    if (result.outcome !== "saved") throw new Error("Concurrent metering budget update");
  }
}
