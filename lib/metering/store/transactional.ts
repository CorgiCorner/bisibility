import { randomBytes } from "node:crypto";
import type { Prisma } from "@/lib/generated/prisma/client";
import type { Clock, Store } from "@usagekit/store";
import { billingImports } from "./billing";
import { currentBudgets, matchingScopes, status } from "./budgets";
import { commands } from "./commands";
import { requestCounters } from "./counters";
import { operationsReader } from "./operations";
import { usageReader } from "./reads";
import { find } from "./records";
import { createSql, Prisma as SqlPrisma } from "./sql";

/** Caller owns commit/rollback and search_path. This never opens a nested transaction. */
export async function createTransactionBoundStore({
  transaction,
  clock,
  afterOperationWrite,
}: {
  transaction: Prisma.TransactionClient;
  clock: Clock;
  afterOperationWrite?: () => void;
}): Promise<Store> {
  const sql = createSql(transaction, { statements: 0, changes: 0n, rowsRead: 0 });
  const run = <T>(body: (client: typeof sql) => Promise<T>) => body(sql);
  const tx = { read: run, write: run };
  await sql.execute(SqlPrisma.sql`INSERT INTO metering_metadata(key,value)
    VALUES('cursor_key',${randomBytes(32).toString("hex")}) ON CONFLICT(key) DO NOTHING`);
  const [metadata] = await sql.query<{ value: string }>(
    SqlPrisma.sql`SELECT value FROM metering_metadata WHERE key='cursor_key'`,
  );
  if (!metadata) throw new Error("Missing metering cursor key");
  const operations = operationsReader(clock, metadata.value);
  const aggregate = usageReader(clock, metadata.value);
  return {
    ...billingImports(tx, clock, afterOperationWrite),
    ...commands(tx, clock, afterOperationWrite),
    ...requestCounters(tx, clock),
    listOperations: (query) => run((client) => operations(client, query)),
    getOperation: (ref) => run(async (client) => (await find(client, ref))?.op ?? null),
    aggregate: (query) => run((client) => aggregate(client, query)),
    definedBudgets: (query) =>
      run((client) => currentBudgets(client, query.scope.namespace, [query.scope])),
    applicableBudgets: (query) =>
      run(async (client) => {
        const budgets = await currentBudgets(
          client,
          query.scope.namespace,
          matchingScopes(query),
          query.surface,
          query.source,
        );
        const result = [];
        for (const budget of budgets) result.push(await status(client, budget, clock.now()));
        return result;
      }),
  };
}
