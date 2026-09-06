import assert from "node:assert/strict";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import { makePublicId } from "@/lib/db/public-id";
import pg from "pg";
import { keywordSchedulesToCheckSchedulesMigration } from "../data-migrations/20260902033000_keyword_schedules_to_check_schedules";
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

async function verifyKeywordScheduleMigration() {
  const key = `dm_smoke_${process.pid}_${Date.now()}`;
  const userId = `${key}_user`;
  const projectId = `${key}_project`;
  const emptyProjectId = `${key}_empty_project`;
  const emptyKeywordId = `${key}_empty_keyword`;
  const locationId = `${key}_location`;
  const keywordIds = {
    daily: `${key}_daily`,
    inherited: `${key}_inherited`,
    paused: `${key}_paused`,
    weekly1: `${key}_weekly_1`,
    weekly2: `${key}_weekly_2`,
  };
  try {
    await client.query(
      `INSERT INTO "users" ("id", "publicId", "name", "email", "updatedAt")
       VALUES ($1, $2, 'Migration smoke', $3, NOW())`,
      [userId, makePublicId("usr"), `${key}@example.com`],
    );
    await client.query(
      `INSERT INTO "locations"
        ("id", "kind", "displayName", "countryCode", "gl", "hl",
         "languageCode", "languageLabel", "primaryGeoName", "secondaryGeoName",
         "canonicalKey", "updatedAt")
       VALUES ($1, 'country', 'Smoke location', 'PL', 'pl', 'en', 'en',
               'English', 'Poland', 'Poland', $2, NOW())`,
      [locationId, key],
    );
    await client.query(
      `INSERT INTO "projects" ("id", "publicId", "name", "ownerId", "updatedAt")
       VALUES
        ($1, $2, 'Migration smoke', $3, NOW()),
        ($4, $5, 'Empty migration smoke', $3, NOW())`,
      [projectId, makePublicId("prj"), userId, emptyProjectId, makePublicId("prj")],
    );
    await client.query(
      `INSERT INTO "project_defaults"
        ("id", "projectId", "frequency", "timezone", "jitterMinutes", "updatedAt")
       VALUES ($1, $2, 'daily', 'UTC', 60, NOW())`,
      [`${key}_defaults`, projectId],
    );
    for (const [name, keywordId] of Object.entries(keywordIds)) {
      await client.query(
        `INSERT INTO "keywords"
          ("id", "publicId", "projectId", "text", "location", "locationId", "updatedAt")
         VALUES ($1, $2, $3, $4, 'PL', $5, NOW())`,
        [keywordId, makePublicId("kw"), projectId, `smoke ${name}`, locationId],
      );
    }
    await client.query(
      `INSERT INTO "keywords"
        ("id", "publicId", "projectId", "text", "location", "locationId", "updatedAt")
       VALUES ($1, $2, $3, 'empty smoke', 'PL', $4, NOW())`,
      [emptyKeywordId, makePublicId("kw"), emptyProjectId, locationId],
    );
    await client.query(`DELETE FROM "keywords" WHERE "id" = $1`, [emptyKeywordId]);
    await client.query(
      `INSERT INTO "keyword_schedules"
        ("id", "keywordId", "frequency", "timezone", "jitterMinutes", "updatedAt")
       VALUES
        ($1, $2, 'daily', 'UTC', 60, NOW()),
        ($3, $4, 'weekly', 'Europe/Warsaw', 30, NOW()),
        ($5, $6, 'weekly', 'Europe/Warsaw', 30, NOW()),
        ($7, $8, 'paused', 'UTC', 60, NOW())`,
      [
        `${key}_schedule_daily`,
        keywordIds.daily,
        `${key}_schedule_weekly_1`,
        keywordIds.weekly1,
        `${key}_schedule_weekly_2`,
        keywordIds.weekly2,
        `${key}_schedule_paused`,
        keywordIds.paused,
      ],
    );

    const context = { batchSize: 200, db, log: () => undefined };
    await keywordSchedulesToCheckSchedulesMigration.run(context);
    const emptySchedules = await client.query(
      `SELECT "id" FROM "check_schedules" WHERE "projectId" = $1`,
      [emptyProjectId],
    );
    assert.deepEqual(emptySchedules.rows, []);
    const schedules = await client.query(
      `SELECT "id", "name", "isDefault", "jitterMinutes"
         FROM "check_schedules"
        WHERE "projectId" = $1
        ORDER BY "name"`,
      [projectId],
    );
    assert.deepEqual(
      schedules.rows.map(({ name, isDefault, jitterMinutes }) => ({
        isDefault,
        jitterMinutes,
        name,
      })),
      [
        { isDefault: true, jitterMinutes: 60, name: "Daily" },
        { isDefault: false, jitterMinutes: 30, name: "Weekly" },
      ],
    );
    const memberships = await client.query(
      `SELECT k."id", cs."name"
         FROM "keywords" k
         LEFT JOIN "check_schedules" cs ON cs."id" = k."checkScheduleId"
        WHERE k."projectId" = $1`,
      [projectId],
    );
    const membershipById = Object.fromEntries(
      memberships.rows.map((row) => [row.id, row.name]),
    );
    assert.equal(membershipById[keywordIds.daily], "Daily");
    assert.equal(membershipById[keywordIds.inherited], "Daily");
    assert.equal(membershipById[keywordIds.weekly1], "Weekly");
    assert.equal(membershipById[keywordIds.weekly2], "Weekly");
    assert.equal(membershipById[keywordIds.paused], null);

    await keywordSchedulesToCheckSchedulesMigration.run(context);
    const rerun = await client.query(
      `SELECT "id" FROM "check_schedules" WHERE "projectId" = $1 ORDER BY "id"`,
      [projectId],
    );
    assert.deepEqual(
      rerun.rows.map(({ id }) => id),
      schedules.rows.map(({ id }) => id).sort(),
    );
    console.log("keyword schedule migration: schedules=2 memberships=4 paused=null rerun=no-op");
  } finally {
    await client.query(`DELETE FROM "users" WHERE "id" = $1`, [userId]).catch(() => undefined);
    await client
      .query(`DELETE FROM "locations" WHERE "id" = $1`, [locationId])
      .catch(() => undefined);
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

  await verifyKeywordScheduleMigration();

} finally {
  await client
    .query(`DELETE FROM "data_migrations" WHERE "id" = ANY($1::text[])`, [
      [cleanId, interruptedId],
    ])
    .catch(() => undefined);
  await client.end();
}
