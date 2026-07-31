import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import pg from "pg";
import { runActiveDataMigrations } from "../data-migrations/runner";
import type {
  DataMigrationDatabase,
  ResolvedDataMigration,
} from "../data-migrations/types";

const { Client } = pg;

function requiredDatabaseUrl() {
  const value = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!value) throw new Error("DIRECT_URL or DATABASE_URL is required.");
  return value;
}

const cleanId = "20990101000000_clean_finalization_probe";
const interruptedId = "20990101001000_interrupted_finalization_probe";
const upgradeSchema = "data_migration_upgrade_probe";
const databaseUrl = requiredDatabaseUrl();
const client = new Client({
  connectionString: databaseUrl,
  ...databaseConnectionConfig(databaseUrl),
});
const db = client as unknown as DataMigrationDatabase;
let cleanRunCalls = 0;
let cleanFinalizationCalls = 0;
let interruptedRunCalls = 0;
let interruptedFinalizationCalls = 0;

const cleanMigration: ResolvedDataMigration = {
  checksum: "c".repeat(64),
  checksumInputs: [],
  contractMigrationId: "20990101003000_contract",
  execution: "deploy-blocking",
  finalize: async () => {
    cleanFinalizationCalls += 1;
  },
  id: cleanId,
  lifecycle: "active",
  prerequisiteSchemaMigrationId: "20990101000000_prerequisite",
  run: async () => {
    cleanRunCalls += 1;
  },
  sourceUrl: new URL(`file:///tmp/${cleanId}.ts`),
};

const interruptedMigration: ResolvedDataMigration = {
  ...cleanMigration,
  finalize: async () => {
    interruptedFinalizationCalls += 1;
    if (interruptedFinalizationCalls === 1) {
      throw new Error("intentional finalization failure");
    }
  },
  id: interruptedId,
  run: async () => {
    interruptedRunCalls += 1;
  },
  sourceUrl: new URL(`file:///tmp/${interruptedId}.ts`),
};

async function readProbe(id: string) {
  const result = await client.query(
    `SELECT "attempts", "runCompletedAt", "finishedAt", "finalizationAttempts",
            "finalizationFailedAt", "finalizationError"
       FROM "data_migrations"
      WHERE "id" = $1`,
    [id],
  );
  return result.rows[0];
}

async function verifyFinishedRowBackfill() {
  await client.query(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`);
  await client.query(`CREATE SCHEMA "${upgradeSchema}"`);
  const upgradeUrl = new URL(databaseUrl);
  upgradeUrl.searchParams.set("schema", upgradeSchema);
  const upgradeClient = new Client({
    connectionString: upgradeUrl.href,
    ...databaseConnectionConfig(upgradeUrl.href),
  });
  await upgradeClient.connect();
  try {
    await upgradeClient.query(
      `CREATE TABLE "data_migrations" (
         "id" TEXT PRIMARY KEY,
         "checksum" TEXT NOT NULL,
         "attempts" INTEGER NOT NULL DEFAULT 0,
         "startedAt" TIMESTAMP(3) NOT NULL,
         "finishedAt" TIMESTAMP(3),
         "failedAt" TIMESTAMP(3),
         "error" TEXT
       )`,
    );
    await upgradeClient.query(
      `INSERT INTO "data_migrations"
         ("id", "checksum", "attempts", "startedAt", "finishedAt")
       VALUES ($1, $2, 1, NOW(), NOW())`,
      ["20260729000000_finished_history", "d".repeat(64)],
    );
    const sql = await readFile(
      "prisma/migrations/20260730073000_data_migration_finalization/migration.sql",
      "utf8",
    );
    await upgradeClient.query(sql);
    const result = await upgradeClient.query(
      `SELECT "finishedAt", "runCompletedAt", "finalizationAttempts"
         FROM "data_migrations"
        WHERE "id" = $1`,
      ["20260729000000_finished_history"],
    );
    assert.equal(
      result.rows[0]?.runCompletedAt?.getTime(),
      result.rows[0]?.finishedAt?.getTime(),
    );
    assert.equal(result.rows[0]?.finalizationAttempts, 0);
  } finally {
    await upgradeClient.end();
  }
}

await client.connect();
try {
  const version = await client.query<{ version: string }>("SELECT version()");
  console.log(`PostgreSQL version: ${version.rows[0]?.version}`);
  await client.query(`DELETE FROM "data_migrations" WHERE "id" = ANY($1::text[])`, [
    [cleanId, interruptedId],
  ]);

  await runActiveDataMigrations(db, [cleanMigration], {
    batchSize: 1,
    log: () => undefined,
  });
  const clean = await readProbe(cleanId);
  assert.equal(cleanRunCalls, 1);
  assert.equal(cleanFinalizationCalls, 1);
  assert.equal(clean?.attempts, 1);
  assert.equal(clean?.finalizationAttempts, 1);
  assert.ok(clean?.runCompletedAt instanceof Date);
  assert.ok(clean?.finishedAt instanceof Date);
  console.log(
    "clean forward: run=1 finalize=1 runCompletedAt=set finishedAt=set",
  );

  await runActiveDataMigrations(db, [cleanMigration], {
    batchSize: 1,
    log: () => undefined,
  });
  assert.equal(cleanRunCalls, 1);
  assert.equal(cleanFinalizationCalls, 1);
  console.log("finished rerun: run=1 finalize=1 migration skipped");

  await assert.rejects(
    runActiveDataMigrations(db, [interruptedMigration], {
      batchSize: 1,
      log: () => undefined,
    }),
    /intentional finalization failure/,
  );

  const failed = await readProbe(interruptedId);
  assert.equal(interruptedRunCalls, 1);
  assert.equal(interruptedFinalizationCalls, 1);
  assert.equal(failed?.attempts, 1);
  assert.ok(failed?.runCompletedAt instanceof Date);
  assert.equal(failed?.finishedAt, null);
  assert.equal(failed?.finalizationAttempts, 1);
  assert.ok(failed?.finalizationFailedAt instanceof Date);
  assert.match(failed?.finalizationError ?? "", /intentional finalization failure/);
  console.log(
    "interrupted finalization: run=1 finalize=1 runCompletedAt=set finishedAt=null",
  );

  await runActiveDataMigrations(db, [interruptedMigration], {
    batchSize: 1,
    log: () => undefined,
  });

  const finished = await readProbe(interruptedId);
  assert.equal(interruptedRunCalls, 1);
  assert.equal(interruptedFinalizationCalls, 2);
  assert.equal(finished?.attempts, 1);
  assert.equal(finished?.finalizationAttempts, 2);
  assert.ok(finished?.finishedAt instanceof Date);
  assert.equal(finished?.finalizationFailedAt, null);
  assert.equal(finished?.finalizationError, null);
  console.log(
    "finalization retry: run=1 finalize=2 finishedAt=set finalizationError=null",
  );

  await verifyFinishedRowBackfill();
  console.log("historical backfill: runCompletedAt copied from finishedAt");
} finally {
  await client
    .query(`DELETE FROM "data_migrations" WHERE "id" = ANY($1::text[])`, [
      [cleanId, interruptedId],
    ])
    .catch(() => undefined);
  await client.query(`DROP SCHEMA IF EXISTS "${upgradeSchema}" CASCADE`).catch(() => undefined);
  await client.end();
}
