import assert from "node:assert/strict";
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

} finally {
  await client
    .query(`DELETE FROM "data_migrations" WHERE "id" = ANY($1::text[])`, [
      [cleanId, interruptedId],
    ])
    .catch(() => undefined);
  await client.end();
}
