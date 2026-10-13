import type { PrismaClient } from "@/lib/generated/prisma/client";
import { prismaPostgresExecutor } from "@usagekit/store-postgres";
import { type Counters, lock as immutableLock, createSql as immutableSql, Prisma } from "./sql";
import { ensureTimestampContract, requireTimestampContract } from "./timestamp-history";

export type { Counters } from "./sql";
export { Prisma } from "./sql";
export type Sql = ReturnType<typeof createSql>;

/** Active host executor. The immutable pre-DDL migration keeps its original narrow SQL port. */
export function createSql(tx: Prisma.TransactionClient, counters: Counters) {
  const core = immutableSql(tx, counters);
  let ready: Promise<number> | undefined;
  const ensureUtc = () => (ready ??= tx.$executeRaw(Prisma.sql`SET LOCAL TIME ZONE 'UTC'`));
  let verified: Promise<void> | undefined;
  let adopted: Promise<void> | undefined;
  const verify = async () => {
    await ensureUtc();
    if (adopted) await adopted;
    else {
      verified ??= requireTimestampContract(prismaPostgresExecutor(tx));
      await verified;
    }
  };
  return {
    verifyTimestampContract: verify,
    async adoptTimestampContract() {
      adopted ??= (async () => {
        await ensureUtc();
        await ensureTimestampContract(prismaPostgresExecutor(tx));
      })();
      await adopted;
    },
    async query<T>(query: Prisma.Sql): Promise<T[]> {
      await verify();
      return core.query<T>(query);
    },
    async execute(query: Prisma.Sql): Promise<number> {
      await verify();
      return core.execute(query);
    },
  };
}

/** The active lock accepts only a guarded port; its first query verifies adoption. */
export function lock(sql: Sql, value: string, tryOnly = false): Promise<boolean> {
  return immutableLock(sql, value, tryOnly);
}

export function transactions(prisma: PrismaClient, schema: string, counters: Counters) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new TypeError("Invalid metering schema");
  const run = <T>(readOnly: boolean, body: (sql: Sql) => Promise<T>) =>
    prisma.$transaction(
      async (tx) => {
        // Connection controls precede the first ledger query. Read controls must not
        // pass through the guarded port, which intentionally cannot bootstrap reads.
        await tx.$executeRaw(Prisma.sql`SET LOCAL TIME ZONE 'UTC'`);
        if (readOnly) await tx.$executeRaw(Prisma.sql`SET TRANSACTION READ ONLY`);
        await tx.$executeRaw(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${schema}"`)}`);
        const sql = createSql(tx, counters);
        if (readOnly) await sql.verifyTimestampContract();
        else await sql.adoptTimestampContract();
        return body(sql);
      },
      {
        timeout: 30000,
        maxWait: 10000,
        isolationLevel: readOnly ? "RepeatableRead" : "ReadCommitted",
      },
    );
  return {
    read: <T>(body: (sql: Sql) => Promise<T>) => run(true, body),
    write: <T>(body: (sql: Sql) => Promise<T>) => run(false, body),
  };
}
