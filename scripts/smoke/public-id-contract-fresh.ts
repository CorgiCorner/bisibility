import assert from "node:assert/strict";
import pg from "pg";
import { databaseConnectionConfig } from "../../lib/db/pool-config.ts";
import {
  publicIdContractEntities,
  publicIdFormatConstraintName,
  publicIdFormatPattern,
  publicIdIndexName,
  publicIdNotNullConstraintName,
} from "../../lib/public-id-contract/definition.ts";
import { readPublicIdContractReadiness } from "../../lib/public-id-contract/readiness.ts";

const { Client } = pg;
const databaseUrl = process.env.PUBLIC_ID_FRESH_DATABASE_URL;
if (!databaseUrl) throw new Error("PUBLIC_ID_FRESH_DATABASE_URL is required.");

const db = new Client({
  connectionString: databaseUrl,
  ...databaseConnectionConfig(databaseUrl),
});

await db.connect();
try {
  const columns = await db.query(
    `SELECT "table_name", "is_nullable"
       FROM information_schema.columns
      WHERE "table_schema" = current_schema()
        AND "column_name" = 'publicId'
        AND "table_name" = ANY($1::text[])`,
    [publicIdContractEntities.map((entity) => entity.table)],
  );
  assert.equal(columns.rows.length, 23);
  for (const row of columns.rows) assert.equal(row.is_nullable, "NO", row.table_name);

  const indexes = await db.query(
    `SELECT index_class.relname AS "name",
            table_class.relname AS "table",
            index_meta.indisunique AS "unique",
            index_meta.indisvalid AS "valid",
            access_method.amname AS "accessMethod",
            index_meta.indpred IS NULL AS "predicateFree",
            index_meta.indexprs IS NULL AS "expressionFree",
            index_meta.indnkeyatts::int AS "keyAttributeCount",
            index_meta.indnatts::int AS "attributeCount",
            ARRAY(
              SELECT attribute_meta.attname
                FROM unnest(index_meta.indkey::smallint[]) WITH ORDINALITY
                  AS key_meta(attnum, ordinality)
                JOIN pg_catalog.pg_attribute AS attribute_meta
                  ON attribute_meta.attrelid = index_meta.indrelid
                 AND attribute_meta.attnum = key_meta.attnum
               WHERE key_meta.ordinality <= index_meta.indnkeyatts
               ORDER BY key_meta.ordinality
            )::text[] AS "keyColumns"
       FROM pg_catalog.pg_index AS index_meta
       JOIN pg_catalog.pg_class AS index_class ON index_class.oid = index_meta.indexrelid
       JOIN pg_catalog.pg_class AS table_class ON table_class.oid = index_meta.indrelid
       JOIN pg_catalog.pg_namespace AS namespace_meta ON namespace_meta.oid = index_class.relnamespace
       JOIN pg_catalog.pg_am AS access_method ON access_method.oid = index_class.relam
      WHERE namespace_meta.nspname = current_schema()
        AND index_class.relname = ANY($1::text[])`,
    [publicIdContractEntities.map((entity) => publicIdIndexName(entity.table))],
  );
  assert.equal(indexes.rows.length, 23);
  for (const entity of publicIdContractEntities) {
    const index = indexes.rows.find((row) => row.name === publicIdIndexName(entity.table));
    assert.deepEqual(
      {
        accessMethod: index?.accessMethod,
        attributeCount: index?.attributeCount,
        expressionFree: index?.expressionFree,
        keyAttributeCount: index?.keyAttributeCount,
        keyColumns: index?.keyColumns,
        predicateFree: index?.predicateFree,
        table: index?.table,
        unique: index?.unique,
        valid: index?.valid,
      },
      {
        accessMethod: "btree",
        attributeCount: 1,
        expressionFree: true,
        keyAttributeCount: 1,
        keyColumns: ["publicId"],
        predicateFree: true,
        table: entity.table,
        unique: true,
        valid: true,
      },
      entity.table,
    );
  }

  const constraints = await db.query(
    `SELECT constraint_meta.conname AS "name",
            constraint_meta.convalidated AS "validated",
            table_class.relname AS "table",
            pg_catalog.pg_get_constraintdef(constraint_meta.oid, false) AS "definition"
       FROM pg_catalog.pg_constraint AS constraint_meta
       JOIN pg_catalog.pg_class AS table_class ON table_class.oid = constraint_meta.conrelid
       JOIN pg_catalog.pg_namespace AS namespace_meta ON namespace_meta.oid = table_class.relnamespace
      WHERE namespace_meta.nspname = current_schema()
        AND constraint_meta.conname = ANY($1::text[])`,
    [publicIdContractEntities.map((entity) => publicIdFormatConstraintName(entity.table))],
  );
  assert.equal(constraints.rows.length, 23);
  for (const entity of publicIdContractEntities) {
    const constraint = constraints.rows.find(
      (row) => row.name === publicIdFormatConstraintName(entity.table),
    );
    assert.equal(constraint?.table, entity.table);
    assert.equal(constraint?.validated, true);
    assert.equal(
      constraint?.definition,
      `CHECK (("publicId" ~ '${publicIdFormatPattern(entity.prefix)}'::text))`,
    );
  }

  const temporaryChecks = await db.query(
    `SELECT COUNT(*)::int AS "count",
            BOOL_AND(convalidated) AS "allValidated"
       FROM pg_catalog.pg_constraint
       JOIN pg_catalog.pg_class AS table_class ON table_class.oid = pg_constraint.conrelid
       JOIN pg_catalog.pg_namespace AS namespace_meta ON namespace_meta.oid = table_class.relnamespace
      WHERE namespace_meta.nspname = current_schema()
        AND "conname" = ANY($1::text[])`,
    [publicIdContractEntities.map((entity) => publicIdNotNullConstraintName(entity.table))],
  );
  assert.equal(temporaryChecks.rows[0]?.count, 0);

  const cleanup = await db.query(
    `SELECT to_regclass('public_id_migrations') AS "legacyLedger",
            to_regclass('public_id_v3_migrations') AS "v3Ledger",
            to_regclass('public_id_v3_write_gate') AS "writeGate",
            to_regtype('"PublicIdEntityType"') AS "entityType",
            (
              SELECT COUNT(*)::int
                FROM pg_catalog.pg_trigger AS trigger_meta
                JOIN pg_catalog.pg_class AS table_meta
                  ON table_meta.oid = trigger_meta.tgrelid
                JOIN pg_catalog.pg_namespace AS namespace_meta
                  ON namespace_meta.oid = table_meta.relnamespace
               WHERE namespace_meta.nspname = current_schema()
                 AND trigger_meta.tgname = 'public_id_v3_write_gate'
                 AND NOT trigger_meta.tgisinternal
            ) AS "writeGateTriggers",
            (
              SELECT COUNT(*)::int
                FROM pg_catalog.pg_tables AS table_meta
               WHERE table_meta.schemaname = current_schema()
                 AND table_meta.tablename NOT IN (
                   '_prisma_migrations',
                   'data_migrations',
                   'public_id_v3_write_gate'
                 )
            ) AS "writeGateTables",
            COUNT(*)::int AS "backlinkPublicIdColumns"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'backlink_snapshots'
        AND column_name = 'publicId'`,
  );
  assert.equal(cleanup.rows[0]?.legacyLedger, null);
  assert.equal(cleanup.rows[0]?.v3Ledger, null);
  assert.equal(cleanup.rows[0]?.writeGate, null);
  assert.equal(cleanup.rows[0]?.entityType, null);
  assert.equal(cleanup.rows[0]?.writeGateTriggers, 0);
  assert.equal(cleanup.rows[0]?.backlinkPublicIdColumns, 0);

  assert.equal(
    await readPublicIdContractReadiness({
      $queryRawUnsafe: async <T>(query: string) =>
        (await db.query(query)).rows as T,
    }),
    true,
  );
  console.log("Fresh final public ID v3 contract PostgreSQL schema passed.");
} finally {
  await db.end();
}
