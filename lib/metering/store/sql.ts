import type { PrismaClient } from "@/lib/generated/prisma/client";
import { Prisma } from "@/lib/generated/prisma/client";

export type Counters = { statements: number; changes: bigint; rowsRead: number };
export type Sql = ReturnType<typeof createSql>;
export function createSql(tx: Prisma.TransactionClient, counters: Counters) {
  return {
    async query<T>(query: Prisma.Sql): Promise<T[]> {
      counters.statements++;
      const result = await tx.$queryRaw<T[]>(query);
      counters.rowsRead += result.length;
      return result;
    },
    async execute(query: Prisma.Sql): Promise<number> {
      counters.statements++;
      const count = await tx.$executeRaw(query);
      counters.changes += BigInt(count);
      return count;
    },
  };
}
export function transactions(prisma: PrismaClient, schema: string, counters: Counters) {
  if (!/^[a-z_][a-z0-9_]*$/.test(schema)) throw new TypeError("Invalid metering schema");
  const run = <T>(readOnly: boolean, body: (sql: Sql) => Promise<T>) =>
    prisma.$transaction(
      async (tx) => {
        const sql = createSql(tx, counters);
        if (readOnly) await sql.execute(Prisma.sql`SET TRANSACTION READ ONLY`);
        await sql.execute(Prisma.sql`SET LOCAL search_path TO ${Prisma.raw(`"${schema}"`)}`);
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
export async function lock(sql: Sql, value: string, tryOnly = false): Promise<boolean> {
  if (tryOnly) {
    const [row] = await sql.query<{ acquired: boolean }>(
      Prisma.sql`SELECT pg_try_advisory_xact_lock(hashtextextended(${value},0)) AS acquired`,
    );
    return row?.acquired === true;
  }
  await sql.query(
    Prisma.sql`SELECT 1 AS acquired FROM pg_advisory_xact_lock(hashtextextended(${value},0))`,
  );
  return true;
}
export { Prisma };
