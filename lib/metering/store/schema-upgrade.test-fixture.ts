import { readFile } from "node:fs/promises";
import type { Receipt } from "@usagekit/core";
import type { PostgresDriver } from "@usagekit/store-postgres";
import { schemaDatabase } from "./schema-database.test-fixture";
import { request } from "./test-data";

export const clock = { now: () => new Date("2026-11-12T00:00:00.000Z") };
export const migration = () =>
  readFile(
    new URL(
      "../../../prisma/migrations/20261112220000_metering_native_settlement/migration.sql",
      import.meta.url,
    ),
    "utf8",
  );
export const upstream = () =>
  import(new URL("./schema.js", import.meta.resolve("@usagekit/store-postgres")).href) as Promise<{
    moneyScaleStatements: string[];
    schemaMigrations: string[][];
  }>;
export const rawEncode = (value: unknown) =>
  JSON.stringify(value, (_, v) => (typeof v === "bigint" ? { $bigint: v.toString() } : v));

export async function fixture() {
  const { db, schema } = await schemaDatabase();
  await db.exec(`CREATE SCHEMA ${schema}; SET search_path TO ${schema};
    CREATE TABLE queued_rank_check_tasks(id text PRIMARY KEY)`);
  for (const name of [
    "20260924011626_metering_shadow",
    "20261006070000_metering_contract",
    "20261006075800_metering_imports",
  ])
    await db.exec(
      await readFile(
        new URL(`../../../prisma/migrations/${name}/migration.sql`, import.meta.url),
        "utf8",
      ),
    );
  const driver: PostgresDriver = {
    transaction: (_readOnly, body) =>
      db.transaction((tx) =>
        body({
          query: async <T>(query: { text: string; values: readonly unknown[] }) =>
            (await tx.query<T>(query.text, [...query.values])).rows,
          execute: async (query) =>
            (await tx.query(query.text, [...query.values])).affectedRows ?? 0,
        }),
      ),
  };
  const seed = async (id: string, value: Receipt, sequence = 0) => {
    const now = clock.now().toISOString();
    await db.query(
      `INSERT INTO metering_operation
      (operation_pk,namespace,principal,operation_id,state,version,semantic_hash,budget_epochs,
       reservation_expires_at,created_at,updated_at,input,warnings)
      VALUES($1,'test','u1',$1,'settled',1,'fixture','{}',$2,$2,$2,$3,'[]')
      ON CONFLICT DO NOTHING`,
      [id, now, rawEncode(request(id))],
    );
    await db.query(
      `INSERT INTO metering_receipt
      (receipt_pk,operation_pk,receipt_id,body,occurred_at,recorded_at,cost_units,cost_certainty,sequence)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
      [
        value.id,
        id,
        value.id,
        rawEncode(value),
        value.occurredAt,
        value.recordedAt,
        value.cost.money?.units.toString() ?? null,
        value.cost.certainty,
        sequence,
      ],
    );
  };
  const snapshot = async () => ({
    rows: (await db.query(`SELECT * FROM metering_receipt ORDER BY receipt_id`)).rows,
    columns: (
      await db.query(
        `SELECT column_name,data_type,is_nullable,column_default,ordinal_position
      FROM information_schema.columns WHERE table_schema=$1 AND table_name='metering_receipt'
      ORDER BY ordinal_position`,
        [schema],
      )
    ).rows,
    constraints: (
      await db.query(`SELECT conname,pg_get_constraintdef(oid) AS definition
      FROM pg_constraint WHERE conrelid='metering_receipt'::regclass ORDER BY conname`)
    ).rows,
  });
  const costColumns = async () =>
    (
      await db.query(
        `SELECT column_default,is_nullable,data_type FROM information_schema.columns
     WHERE table_schema=$1 AND table_name='metering_receipt' AND column_name='cost_scale'`,
        [schema],
      )
    ).rows;
  return { db, schema, seed, snapshot, costColumns, options: { driver, schema, clock } };
}
