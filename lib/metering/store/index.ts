import type { PrismaClient } from "@/lib/generated/prisma/client";
import type { Clock } from "@usagekit/store";
import {
  createPrismaPostgresDriver,
  createPostgresStore as createSharedPostgresStore,
} from "@usagekit/store-postgres";
import { billingImports } from "./billing";
import { type Counters, transactions } from "./host-sql";
import { utcPostgresDriver } from "./timestamp-policy";

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
  const store = await createSharedPostgresStore({
    driver: utcPostgresDriver(createPrismaPostgresDriver(prisma), schema),
    clock,
    schema,
    counters,
    testHooks,
  });
  // Invoice corrections retain the host's funding-specific budget measurement.
  const { importBilling } = billingImports(
    transactions(prisma, schema, counters),
    clock,
    testHooks?.afterOperationWrite,
  );
  return { ...store, importBilling };
}
