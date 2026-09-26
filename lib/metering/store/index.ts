import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Budget } from "@usagekit/core";
import type { Clock, Store } from "@usagekit/store";
import { currentBudgets, matchingScopes, saveBudget, status } from "./budgets";
import { commands } from "./commands";
import { usageReader } from "./reads";
import { find } from "./records";
import { type Counters, Prisma, transactions } from "./sql";

export async function createPostgresStore({
  prisma,
  clock,
  schema = "public",
  counters = { statements: 0, changes: 0n, rowsRead: 0 },
  testHooks,
}: {
  prisma: PrismaClient;
  clock: Clock;
  schema?: string;
  counters?: Counters;
  testHooks?: { afterOperationWrite?: () => void };
}) {
  const tx = transactions(prisma, schema, counters);
  const secret = await tx.write(async (sql) => {
    await sql.execute(
      Prisma.sql`INSERT INTO metering_metadata(key,value) VALUES('cursor_key',${randomBytes(32).toString("hex")}) ON CONFLICT(key) DO NOTHING`,
    );
    const [row] = await sql.query<{ value: string }>(
      Prisma.sql`SELECT value FROM metering_metadata WHERE key='cursor_key'`,
    );
    if (!row) throw new Error("Missing metering cursor key");
    return row.value;
  });
  const aggregate = usageReader(clock, secret);
  const store: Store = {
    ...commands(tx, clock, testHooks?.afterOperationWrite),
    getOperation: (ref) => tx.read(async (sql) => (await find(sql, ref))?.op ?? null),
    aggregate: (query) => tx.read((sql) => aggregate(sql, query)),
    definedBudgets: (query) =>
      tx.read((sql) => currentBudgets(sql, query.scope.namespace, [query.scope])),
    applicableBudgets: (query) =>
      tx.read(async (sql) => {
        const budgets = await currentBudgets(
          sql,
          query.scope.namespace,
          matchingScopes(query),
          query.surface,
        );
        const result = [];
        for (const budget of budgets) result.push(await status(sql, budget, clock.now()));
        return result;
      }),
  };
  return {
    ...store,
    putBudget: (budget: Budget) => tx.write((sql) => saveBudget(sql, budget)),
    listBudgets: (namespace: string) => tx.read((sql) => currentBudgets(sql, namespace)),
    counters,
  };
}
