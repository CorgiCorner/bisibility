import assert from "node:assert/strict";
import { readdir } from "node:fs/promises";
import { databaseConnectionConfig } from "../../lib/db/pool-config.ts";
import {
  makePublicId,
  PUBLIC_ID_RESOURCE_REGISTRY,
  type PublicIdPrefix,
} from "../../lib/db/public-id.ts";
import pg from "pg";

const { Client } = pg;
const BASELINE_ID = "20260806000000_squashed_migrations";
const databaseUrl = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DIRECT_URL or DATABASE_URL is required.");

const publicIdTables = {
  al: "triggered_alerts",
  alr: "alert_rules",
  audit: "audit_logs",
  check: "rank_checks",
  cmp: "competitors",
  conn: "provider_connections",
  dwh: "ingest_hooks",
  ferry: "migration_tokens",
  imp: "cloud_import_jobs",
  inv: "invites",
  key: "api_keys",
  kw: "keywords",
  mbr: "memberships",
  ntf: "notifications",
  pat: "personal_access_tokens",
  prj: "projects",
  sid: "sessions",
  sig: "signals",
  svkw: "saved_keywords",
  tag: "tags",
  usr: "users",
  viw: "saved_views",
  we: "webhook_endpoints",
} as const satisfies Record<PublicIdPrefix, string>;

const nonPublicIdChecks = [
  "rank_check_raw_purge_progress_batch_count_check",
  "rank_check_raw_purge_progress_max_batches_check",
  "rank_check_raw_purge_progress_retention_days_check",
  "rank_check_raw_purge_progress_updated_count_check",
] as const;

const specialIndexes = {
  keywords_projectId_normalized_text_idx: {
    expression: "lower(btrim(text))",
    predicate: null,
  },
  queued_rank_check_batches_active_queueDeadlineAt_id_idx: {
    expression: null,
    predicate:
      "(state = ANY (ARRAY['ambiguous'::text, 'prepared'::text, 'ready'::text, 'submitted'::text, 'submitting'::text]))",
  },
  rank_check_raw_purge_progress_scrub_idx: {
    expression: null,
    predicate: '(completed AND ("resultClearedAt" IS NULL))',
  },
  rank_checks_checkedAt_id_raw_not_null_idx: {
    expression: null,
    predicate: "(raw IS NOT NULL)",
  },
} as const;

const db = new Client({
  connectionString: databaseUrl,
  ...databaseConnectionConfig(databaseUrl),
});

await db.connect();
try {
  assert.deepEqual(Object.keys(publicIdTables).sort(), Object.keys(PUBLIC_ID_RESOURCE_REGISTRY).sort());

  const baseline = await db.query<{ count: number }>(
    `SELECT COUNT(*)::int AS "count"
       FROM "_prisma_migrations"
      WHERE "migration_name" = $1
        AND "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL`,
    [BASELINE_ID],
  );
  assert.equal(baseline.rows[0]?.count, 1, "The current baseline marker must be applied once.");

  if (process.env.EXPECT_FRESH_LEDGER === "1") {
    // A fresh database holds exactly what prisma/migrations holds: the squashed baseline plus
    // whatever shipped after it. The literal 1 this used to assert was only true until the first
    // migration after the squash, so it failed for the wrong reason the moment one arrived.
    const migrationsDir = new URL("../../prisma/migrations/", import.meta.url);
    const local = (await readdir(migrationsDir, { withFileTypes: true })).filter((entry) =>
      entry.isDirectory(),
    ).length;
    const ledger = await db.query<{ count: number }>(
      `SELECT COUNT(*)::int AS "count" FROM "_prisma_migrations"`,
    );
    assert.equal(
      ledger.rows[0]?.count,
      local,
      "A fresh database must contain one row per local migration.",
    );
  }

  // Read the raw value first: Number(undefined ?? "") is 0, not NaN, so the old guard treated an
  // unset variable as "expect zero historical rows" and ran this production-rehearsal assertion in
  // every scenario. It passed only while the baseline was the sole migration in the ledger.
  const historicalRowsSetting = process.env.EXPECT_HISTORICAL_MIGRATION_ROWS?.trim();
  const expectedHistoricalRows = Number(historicalRowsSetting);
  if (historicalRowsSetting && Number.isInteger(expectedHistoricalRows) && expectedHistoricalRows >= 0) {
    const ledger = await db.query<{ historical: number; total: number }>(
      `SELECT COUNT(*)::int AS "total",
              COUNT(*) FILTER (WHERE "migration_name" <> $1)::int AS "historical"
         FROM "_prisma_migrations"`,
      [BASELINE_ID],
    );
    assert.equal(
      ledger.rows[0]?.historical,
      expectedHistoricalRows,
      "The production rehearsal must retain every historical migration row.",
    );
    assert.equal(
      ledger.rows[0]?.total,
      expectedHistoricalRows + 1,
      "The production rehearsal must add only the current baseline marker.",
    );
  }

  const expectedTables = Object.values(publicIdTables);
  const columns = await db.query<{ isNullable: string; table: string }>(
    `SELECT "table_name" AS "table", "is_nullable" AS "isNullable"
       FROM information_schema.columns
      WHERE "table_schema" = current_schema()
        AND "column_name" = 'publicId'
        AND "table_name" = ANY($1::text[])
      ORDER BY "table_name"`,
    [expectedTables],
  );
  assert.equal(columns.rows.length, expectedTables.length);
  for (const row of columns.rows) assert.equal(row.isNullable, "NO", row.table);

  const constraintNames = Object.entries(publicIdTables).map(
    ([, table]) => `${table}_public_id_contract_format`,
  );
  const constraints = await db.query<{
    definition: string;
    name: string;
    table: string;
    validated: boolean;
  }>(
    `SELECT constraint_meta.conname AS "name",
            constraint_meta.convalidated AS "validated",
            table_meta.relname AS "table",
            pg_get_constraintdef(constraint_meta.oid, false) AS "definition"
       FROM pg_constraint AS constraint_meta
       JOIN pg_class AS table_meta ON table_meta.oid = constraint_meta.conrelid
       JOIN pg_namespace AS namespace_meta ON namespace_meta.oid = table_meta.relnamespace
      WHERE namespace_meta.nspname = current_schema()
        AND constraint_meta.conname = ANY($1::text[])
      ORDER BY constraint_meta.conname`,
    [constraintNames],
  );
  assert.equal(constraints.rows.length, constraintNames.length);
  for (const [prefix, table] of Object.entries(publicIdTables)) {
    const constraint = constraints.rows.find(
      (row) => row.name === `${table}_public_id_contract_format`,
    );
    assert.equal(constraint?.table, table);
    assert.equal(constraint?.validated, true);
    assert.equal(
      constraint?.definition,
      `CHECK (("publicId" ~ '^${prefix}_[a-z][a-z0-9]{23}$'::text))`,
    );
  }

  const extraChecks = await db.query<{ name: string; validated: boolean }>(
    `SELECT conname AS "name", convalidated AS "validated"
       FROM pg_constraint
      WHERE connamespace = current_schema()::regnamespace
        AND conname = ANY($1::text[])
      ORDER BY conname`,
    [nonPublicIdChecks],
  );
  assert.deepEqual(
    extraChecks.rows,
    [...nonPublicIdChecks].sort().map((name) => ({ name, validated: true })),
  );

  const specialIndexRows = await db.query<{
    expression: string | null;
    name: keyof typeof specialIndexes;
    predicate: string | null;
  }>(
    `SELECT index_meta.relname AS "name",
            pg_get_expr(index_def.indexprs, index_def.indrelid) AS "expression",
            pg_get_expr(index_def.indpred, index_def.indrelid) AS "predicate"
       FROM pg_index AS index_def
       JOIN pg_class AS index_meta ON index_meta.oid = index_def.indexrelid
       JOIN pg_namespace AS namespace_meta ON namespace_meta.oid = index_meta.relnamespace
      WHERE namespace_meta.nspname = current_schema()
        AND index_meta.relname = ANY($1::text[])
      ORDER BY index_meta.relname`,
    [Object.keys(specialIndexes)],
  );
  assert.equal(specialIndexRows.rows.length, Object.keys(specialIndexes).length);
  for (const row of specialIndexRows.rows) {
    assert.deepEqual(
      { expression: row.expression, predicate: row.predicate },
      specialIndexes[row.name],
      row.name,
    );
  }

  const lifecycle = await db.query<{
    functionCount: number;
    ledger: string | null;
    triggerCount: number;
    writeGate: string | null;
  }>(
    `SELECT to_regclass(format('%I.%I', current_schema(), 'public_id_v3_write_gate'))::text AS "writeGate",
            to_regclass(format('%I.%I', current_schema(), 'public_id_v3_migrations'))::text AS "ledger",
            (
              SELECT COUNT(*)::int
              FROM pg_proc AS function_meta
              JOIN pg_namespace AS namespace_meta ON namespace_meta.oid = function_meta.pronamespace
              WHERE namespace_meta.nspname = current_schema()
                AND function_meta.proname = 'enforce_public_id_v3_write_gate'
            ) AS "functionCount",
            (
              SELECT COUNT(*)::int
              FROM pg_trigger
              WHERE NOT tgisinternal AND tgname = 'public_id_v3_write_gate'
            ) AS "triggerCount"`,
  );
  assert.deepEqual(lifecycle.rows[0], {
    functionCount: 0,
    ledger: null,
    triggerCount: 0,
    writeGate: null,
  });

  const dataMigrationColumns = await db.query<{ column: string }>(
    `SELECT column_name AS "column"
       FROM information_schema.columns
      WHERE table_schema = current_schema()
        AND table_name = 'data_migrations'
      ORDER BY ordinal_position`,
  );
  assert.deepEqual(
    dataMigrationColumns.rows.map((row) => row.column),
    [
      "id",
      "checksum",
      "attempts",
      "startedAt",
      "finishedAt",
      "failedAt",
      "error",
      "runCompletedAt",
      "finalizationAttempts",
      "finalizationFailedAt",
      "finalizationError",
    ],
  );

  const suffix = `${Date.now()}-${process.pid}`;
  const validPublicId = makePublicId("usr");
  await db.query("BEGIN");
  try {
    const inserted = await db.query<{ publicId: string }>(
      `INSERT INTO users (id, "publicId", name, email, "updatedAt")
       VALUES ($1, $2, 'Baseline probe', $3, NOW())
       RETURNING "publicId"`,
      [`baseline-valid-${suffix}`, validPublicId, `baseline-valid-${suffix}@example.invalid`],
    );
    assert.equal(inserted.rows[0]?.publicId, validPublicId);
  } finally {
    await db.query("ROLLBACK");
  }

  await db.query("BEGIN");
  try {
    await assert.rejects(
      db.query(
        `INSERT INTO users (id, "publicId", name, email, "updatedAt")
         VALUES ($1, 'invalid', 'Baseline probe', $2, NOW())`,
        [`baseline-invalid-${suffix}`, `baseline-invalid-${suffix}@example.invalid`],
      ),
      (error: unknown) => error instanceof Error && "code" in error && error.code === "23514",
    );
  } finally {
    await db.query("ROLLBACK");
  }

  console.log("Squashed migration baseline catalog passed.");
} finally {
  await db.end();
}
