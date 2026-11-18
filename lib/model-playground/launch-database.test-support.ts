import { PGlite } from "@electric-sql/pglite";
import { Pool } from "pg";

type Query = {
  query<T>(text: string, values?: unknown[]): Promise<{ rows: T[]; affectedRows?: number }>;
  exec(text: string): Promise<unknown>;
};
/**
 * One fixture schema per Vitest worker: files that run at the same time in one database would
 * otherwise drop and recreate each other's tables mid-test.
 */
export function fixtureSchema(base: "launch_fixture" | "payment_fixture") {
  return `${base}_w${process.env.VITEST_POOL_ID ?? "0"}`;
}

/** An explicit disposable-fixture URL only; never uses the application DATABASE_URL. */
export function launchTestDatabase(
  url = process.env.MODEL_LAUNCH_TEST_DATABASE_URL,
  schema = fixtureSchema("launch_fixture"),
) {
  if (!url) return new PGlite();
  const pool = new Pool({
    connectionString: url,
    max: 8,
    options: `-c search_path=${schema}`,
  });
  const query: Query["query"] = async <T>(text: string, values?: unknown[]) => {
    const result = await pool.query(text, values);
    return { rows: result.rows as T[], affectedRows: result.rowCount ?? 0 };
  };
  return {
    query,
    exec: (text: string) => pool.query(text),
    close: () => pool.end(),
    async transaction<T>(work: (tx: Query) => Promise<T>) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await work({
          query: async <R>(text: string, values?: unknown[]) => {
            const result = await client.query(text, values);
            return { rows: result.rows as R[], affectedRows: result.rowCount ?? 0 };
          },
          exec: (text: string) => client.query(text),
        });
        await client.query("COMMIT");
        return result;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      } finally {
        client.release();
      }
    },
  };
}

/** One connection, so SET LOCAL matches the transaction Prisma opens around a migration. */
export async function applySqlScript(
  db: {
    transaction: (
      work: (tx: { exec: (text: string) => Promise<unknown> }) => Promise<unknown>,
    ) => Promise<unknown>;
  },
  script: string,
) {
  await db.transaction(async (tx) => {
    await tx.exec(script);
  });
}

/** Keep the body failure primary, including falsy thrown values. */
export async function withFixtureRestore<T>(
  work: () => Promise<T>,
  restore: () => Promise<unknown>,
): Promise<T> {
  let outcome: { value: T } | { error: unknown };
  let cleanup: { error: unknown } | undefined;
  try {
    outcome = { value: await work() };
  } catch (error) {
    outcome = { error };
  } finally {
    try {
      await restore();
    } catch (error) {
      cleanup = { error };
    }
  }
  if ("error" in outcome) {
    if (cleanup) console.error("Fixture cleanup failed", cleanup.error);
    throw outcome.error;
  }
  if (cleanup) throw cleanup.error;
  return outcome.value;
}

export async function withoutFixtureTrigger<T>(
  db: { exec: (sql: string) => Promise<unknown> },
  table: string,
  trigger: string,
  work: () => Promise<T>,
): Promise<T> {
  await db.exec(`ALTER TABLE ${table} DISABLE TRIGGER ${trigger}`);
  return withFixtureRestore(work, () => db.exec(`ALTER TABLE ${table} ENABLE TRIGGER ${trigger}`));
}
