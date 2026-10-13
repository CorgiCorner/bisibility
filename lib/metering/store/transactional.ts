import type { Prisma } from "@/lib/generated/prisma/client";
import type { Clock, Store } from "@usagekit/store";
import {
  createTransactionBoundStore as createSharedTransactionBoundStore,
  prismaPostgresExecutor,
} from "@usagekit/store-postgres";
import { billingImports } from "./billing";
import { createSql } from "./host-sql";
import { ensureTimestampContract } from "./timestamp-history";
import { setLocalUtc } from "./timestamp-policy";

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
  const counters = { statements: 0, changes: 0n, rowsRead: 0 };
  const executor = prismaPostgresExecutor(transaction);
  await setLocalUtc(executor);
  await ensureTimestampContract(executor);
  const store = await createSharedTransactionBoundStore({
    transaction: executor,
    clock,
    counters,
    afterOperationWrite,
  });
  const sql = createSql(transaction, counters);
  const run = <T>(body: (client: typeof sql) => Promise<T>) => body(sql);
  const { importBilling } = billingImports({ read: run, write: run }, clock, afterOperationWrite);
  return { ...store, importBilling };
}
