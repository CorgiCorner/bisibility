import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Client } from "pg";
import { testDatabaseUrl } from "./test-fixture";

type QueryResult<T> = { rows: T[]; affectedRows?: number };
type SchemaSql = {
  query<T = Record<string, unknown>>(text: string, values?: unknown[]): Promise<QueryResult<T>>;
  exec(text: string): Promise<unknown>;
};
export type SchemaDatabase = SchemaSql & {
  transaction<T>(body: (tx: SchemaSql) => Promise<T>): Promise<T>;
  close(): Promise<void>;
};

export async function schemaDatabase(): Promise<{ db: SchemaDatabase; schema: string }> {
  const schema = `metering_upgrade_${randomUUID().replaceAll("-", "")}`;
  if (!process.env.METERING_TEST_DATABASE_URL) return { db: new PGlite(), schema };
  const client = new Client({ connectionString: testDatabaseUrl() });
  await client.connect();
  const db: SchemaDatabase = {
    async query<T>(text: string, values?: unknown[]) {
      const result = await client.query(text, values);
      return { rows: result.rows as T[], affectedRows: result.rowCount ?? 0 };
    },
    exec: (text) => client.query(text),
    async transaction(body) {
      await client.query("BEGIN");
      try {
        const value = await body(db);
        await client.query("COMMIT");
        return value;
      } catch (error) {
        await client.query("ROLLBACK");
        throw error;
      }
    },
    async close() {
      try {
        await client.query("ROLLBACK");
        await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await client.query(`DROP SCHEMA IF EXISTS "${schema}_neighbor" CASCADE`);
      } finally {
        await client.end();
      }
    },
  };
  return { db, schema };
}
