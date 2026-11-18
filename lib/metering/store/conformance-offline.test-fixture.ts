import { Prisma, type PrismaClient } from "@/lib/generated/prisma/client";
import { PGlite } from "@electric-sql/pglite";
import { serialOnlyTransactions } from "./conformance-coverage.test-fixture";
import { initializeFixtureSchema, resetFixtureTables } from "./fixture-schema.test-fixture";
import { fixture } from "./test-fixture";

const schema = "metering_offline_conformance";

/** One SQL connection models serialized transactions; independent locks need real PostgreSQL. */
async function offlineDatabase() {
  const parsers = { 1700: (value: string) => new Prisma.Decimal(value), 20: BigInt };
  let db = new PGlite({ parsers });
  const transaction = serialOnlyTransactions();
  const executor = (connection: Pick<PGlite, "query">) => {
    const query = async <T>(text: string, values: unknown[]) => {
      const result = await connection.query<Record<string, unknown>>(text, values);
      return result.rows as T[];
    };
    const compile = (sql: Prisma.Sql | TemplateStringsArray, values: unknown[]) =>
      Array.isArray(sql) ? Prisma.sql(sql, ...values) : (sql as Prisma.Sql);
    return {
      $queryRawUnsafe: <T>(text: string, ...values: unknown[]) => query<T>(text, values),
      $executeRawUnsafe: async (text: string, ...values: unknown[]) =>
        (await connection.query(text, values)).affectedRows ?? 0,
      $queryRaw: <T>(sql: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
        const q = compile(sql, values);
        return query<T>(q.text, q.values);
      },
      $executeRaw: async (sql: Prisma.Sql | TemplateStringsArray, ...values: unknown[]) => {
        const q = compile(sql, values);
        return (await connection.query(q.text, q.values)).affectedRows ?? 0;
      },
    };
  };
  const client = {
    $transaction: <T>(body: (tx: Prisma.TransactionClient) => Promise<T>) =>
      transaction(() =>
        db.transaction((tx) => body(executor(tx) as unknown as Prisma.TransactionClient)),
      ),
    async $disconnect() {
      const archive = await db.dumpDataDir();
      await db.close();
      db = new PGlite({ loadDataDir: archive, parsers });
      await db.waitReady;
    },
  } as unknown as PrismaClient;
  await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema}`);
  await client.$transaction(initializeFixtureSchema);
  return { client, close: () => db.close() };
}

let pool: ReturnType<typeof offlineDatabase> | undefined;
export async function createOfflineConformanceFixture() {
  pool ??= offlineDatabase();
  const database = await pool;
  return fixture({
    schema,
    pooledClient: database.client,
    url: "postgresql://offline@127.0.0.1/offline",
    connect: () => database.client,
    resetOnClose: () => resetFixtureTables(database.client, schema),
  });
}

export async function closeOfflineConformancePool() {
  await (await pool)?.close();
  pool = undefined;
}
