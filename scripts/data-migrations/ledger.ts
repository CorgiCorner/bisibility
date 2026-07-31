import { DATA_MIGRATION_RECOVERY_COMMAND } from "@/lib/data-migrations/manifest";
import type { DataMigrationDatabase, ResolvedDataMigration } from "./types";

const MAX_ERROR_LENGTH = 4_000;

function booleanValue(value: unknown) {
  return value === true;
}

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function errorText(error: unknown) {
  const text = error instanceof Error ? error.stack || error.message : String(error);
  return text.slice(0, MAX_ERROR_LENGTH);
}

export async function readDataMigrationLedger(
  db: DataMigrationDatabase,
  migrations: readonly ResolvedDataMigration[],
) {
  const exists = await db.query(
    `SELECT to_regclass('data_migrations') IS NOT NULL AS "exists"`,
  );
  if (!booleanValue(exists.rows[0]?.exists)) {
    throw new Error(
      `The data_migrations ledger is missing; run ${DATA_MIGRATION_RECOVERY_COMMAND}.`,
    );
  }
  const result = await db.query(
    `SELECT "id", "checksum", "attempts", "startedAt", "runCompletedAt",
            "finishedAt", "failedAt", "error", "finalizationAttempts",
            "finalizationFailedAt", "finalizationError"
       FROM "data_migrations"
      WHERE "id" = ANY($1::text[])`,
    [migrations.map((migration) => migration.id)],
  );
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

export function assertDataMigrationChecksum(
  migration: ResolvedDataMigration,
  row: Record<string, unknown> | undefined,
) {
  const stored = stringValue(row?.checksum);
  if (stored && stored !== migration.checksum) {
    throw new Error(
      `Data migration checksum mismatch for ${migration.id}; create a new migration instead of editing an applied or attempted migration.`,
    );
  }
}

export async function startRunAttempt(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
) {
  const result = await db.query(
    `INSERT INTO "data_migrations"
       ("id", "checksum", "attempts", "startedAt", "runCompletedAt",
        "finishedAt", "failedAt", "error", "finalizationAttempts",
        "finalizationFailedAt", "finalizationError")
     VALUES ($1, $2, 1, NOW(), NULL, NULL, NULL, NULL, 0, NULL, NULL)
     ON CONFLICT ("id") DO NOTHING
     RETURNING "attempts"`,
    [migration.id, migration.checksum],
  );
  if (result.rows.length !== 1) {
    throw new Error(
      `Data migration run ${migration.id} was already attempted and must not be rerun.`,
    );
  }
}

export async function completeRun(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
) {
  const result = await db.query(
    `UPDATE "data_migrations"
        SET "runCompletedAt" = NOW(), "failedAt" = NULL, "error" = NULL
      WHERE "id" = $1 AND "checksum" = $2
        AND "runCompletedAt" IS NULL AND "finishedAt" IS NULL
      RETURNING "id"`,
    [migration.id, migration.checksum],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Could not complete data migration run ${migration.id}.`);
  }
}

export async function failRun(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
  error: unknown,
) {
  await db
    .query(
      `UPDATE "data_migrations"
          SET "failedAt" = NOW(), "error" = $3
        WHERE "id" = $1 AND "checksum" = $2
          AND "runCompletedAt" IS NULL AND "finishedAt" IS NULL`,
      [migration.id, migration.checksum, errorText(error)],
    )
    .catch(() => undefined);
}

export async function startFinalizationAttempt(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
) {
  const result = await db.query(
    `UPDATE "data_migrations"
        SET "finalizationAttempts" = "finalizationAttempts" + 1,
            "finalizationFailedAt" = NULL,
            "finalizationError" = NULL
      WHERE "id" = $1 AND "checksum" = $2
        AND "runCompletedAt" IS NOT NULL AND "finishedAt" IS NULL
      RETURNING "finalizationAttempts"`,
    [migration.id, migration.checksum],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Could not claim data migration finalization ${migration.id}.`);
  }
}

export async function failFinalization(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
  error: unknown,
) {
  await db
    .query(
      `UPDATE "data_migrations"
          SET "finalizationFailedAt" = NOW(), "finalizationError" = $3
        WHERE "id" = $1 AND "checksum" = $2
          AND "runCompletedAt" IS NOT NULL AND "finishedAt" IS NULL`,
      [migration.id, migration.checksum, errorText(error)],
    )
    .catch(() => undefined);
}

export async function finishMigration(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
) {
  const result = await db.query(
    `UPDATE "data_migrations"
        SET "finishedAt" = NOW(),
            "failedAt" = NULL,
            "error" = NULL,
            "finalizationFailedAt" = NULL,
            "finalizationError" = NULL
      WHERE "id" = $1 AND "checksum" = $2
        AND "runCompletedAt" IS NOT NULL AND "finishedAt" IS NULL
      RETURNING "id"`,
    [migration.id, migration.checksum],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Could not finish data migration ${migration.id}.`);
  }
}
