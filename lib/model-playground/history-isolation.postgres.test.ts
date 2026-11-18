import { expect, test } from "vitest";
import { historyHarness } from "./history.test-support";
import { launchTestDatabase } from "./launch-database.test-support";

const first = historyHarness();
const second = historyHarness();
test.skipIf(!process.env.MODEL_LAUNCH_TEST_DATABASE_URL)(
  "real history harnesses own separate non-public schemas",
  async () => {
    const one = (await first.db.query<{ schema: string }>(`SELECT current_schema() AS schema`))
      .rows[0].schema;
    const two = (await second.db.query<{ schema: string }>(`SELECT current_schema() AS schema`))
      .rows[0].schema;
    expect(one).toMatch(/^mp_history_/);
    expect(two).toMatch(/^mp_history_/);
    expect(one).not.toBe(two);
    await first.launch();
    expect((await first.db.query(`SELECT id FROM model_playground_runs`)).rows).toHaveLength(1);
    expect((await second.db.query(`SELECT id FROM model_playground_runs`)).rows).toHaveLength(0);
    await second.launch();
    await first.db.exec(`DROP SCHEMA "${one}" CASCADE`);
    expect((await second.db.query(`SELECT id FROM model_playground_runs`)).rows).toHaveLength(1);
  },
);

test.skipIf(!process.env.MODEL_LAUNCH_TEST_DATABASE_URL)(
  "launch pool applies the schema search path on two connections",
  async () => {
    const schema = `mp_pool_${crypto.randomUUID().replaceAll("-", "")}`;
    const db = launchTestDatabase(process.env.MODEL_LAUNCH_TEST_DATABASE_URL, schema);
    try {
      await db.exec(`CREATE SCHEMA "${schema}"`);
      await db.exec(`CREATE TABLE "${schema}".probe(id int)`);
      const read = () =>
        db.transaction(async (tx) => {
          const [row] = (
            await tx.query<{ schema: string; pid: number }>(
              `SELECT current_schema() AS schema, pg_backend_pid() AS pid`,
            )
          ).rows;
          await tx.query(`SELECT id FROM probe`);
          await tx.query(`SELECT pg_sleep(0.3)`);
          return row;
        });
      const rows = await Promise.all([read(), read()]);
      expect(rows.map((row) => row.schema)).toEqual([schema, schema]);
      expect(rows[0]?.pid).not.toBe(rows[1]?.pid);
    } finally {
      await db.exec(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await db.close();
    }
  },
);
