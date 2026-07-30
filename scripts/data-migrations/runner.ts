import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import { DATA_MIGRATION_RECOVERY_COMMAND } from "@/lib/data-migrations/manifest";
import type {
  DataMigrationDatabase,
  DataMigrationDefinition,
  ResolvedDataMigration,
} from "./types";

const DATA_MIGRATION_LOCK = "bisibility-data-migrations";
const DATA_MIGRATION_ID = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const WRITE_GATE_PHASE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const LOCK_RETRY_INITIAL_MS = 250;
const LOCK_RETRY_MAX_MS = 5_000;
const MAX_ERROR_LENGTH = 4_000;

type RunOptions = {
  batchSize: number;
  lockTimeoutMs?: number;
  log?: (message: string) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function stringValue(value: unknown) {
  return typeof value === "string" ? value : null;
}

function booleanValue(value: unknown) {
  return value === true;
}

function errorText(error: unknown) {
  const text = error instanceof Error ? error.stack || error.message : String(error);
  return text.slice(0, MAX_ERROR_LENGTH);
}

export function validateDataMigrationRegistry(
  registry: readonly DataMigrationDefinition[],
) {
  const seen = new Set<string>();
  let previous = "";
  for (const migration of registry) {
    if (!DATA_MIGRATION_ID.test(migration.id)) {
      throw new Error(`Invalid data migration ID: ${migration.id}.`);
    }
    if (seen.has(migration.id)) throw new Error(`Duplicate data migration ID: ${migration.id}.`);
    if (previous && migration.id <= previous) {
      throw new Error("Data migration registry must be in strict timestamp order.");
    }
    if (migration.afterFinish && !migration.writeGatePhase) {
      throw new Error(`Data migration ${migration.id} post-finish hook requires a write gate phase.`);
    }
    if (migration.writeGatePhase && !WRITE_GATE_PHASE.test(migration.writeGatePhase)) {
      throw new Error(`Data migration ${migration.id} has an invalid write gate phase.`);
    }
    const sourceName = basename(migration.sourceUrl.pathname, extname(migration.sourceUrl.pathname));
    if (sourceName !== migration.id) {
      throw new Error(`Data migration source filename does not match ${migration.id}.`);
    }
    seen.add(migration.id);
    previous = migration.id;
  }
}

export async function resolveDataMigrationRegistry(
  registry: readonly DataMigrationDefinition[],
): Promise<ResolvedDataMigration[]> {
  validateDataMigrationRegistry(registry);
  return Promise.all(
    registry.map(async (migration) => {
      const actual = await computeDataMigrationChecksum(migration);
      if (actual !== migration.checksum) {
        throw new Error(
          `Data migration checksum mismatch for ${migration.id}; create a new migration instead of editing its implementation inputs.`,
        );
      }
      return { ...migration, checksum: actual };
    }),
  );
}

export async function computeDataMigrationChecksum(
  migration: Pick<DataMigrationDefinition, "checksumInputs">,
) {
  const hash = createHash("sha256");
  for (const input of migration.checksumInputs) {
    hash.update(input.label);
    hash.update("\0");
    hash.update(await readFile(input.url));
    hash.update("\0");
  }
  return hash.digest("hex");
}

async function acquireLock(
  db: DataMigrationDatabase,
  {
    lockTimeoutMs,
    now,
    sleep,
  }: Required<Pick<RunOptions, "lockTimeoutMs" | "now" | "sleep">>,
) {
  const deadline = now() + lockTimeoutMs;
  let delay = LOCK_RETRY_INITIAL_MS;
  while (true) {
    const result = await db.query(
      `SELECT pg_try_advisory_lock(
         hashtext($1 || ':' || current_schema())
       ) AS "locked"`,
      [DATA_MIGRATION_LOCK],
    );
    if (booleanValue(result.rows[0]?.locked)) return;
    const remaining = deadline - now();
    if (remaining <= 0) {
      throw new Error(
        "Timed out waiting for the blocking data migration lock. Verify the active deployment, then consciously redeploy on Railway or rerun npm run db:migrate.",
      );
    }
    await sleep(Math.min(delay, remaining));
    delay = Math.min(delay * 2, LOCK_RETRY_MAX_MS);
  }
}

async function releaseLock(db: DataMigrationDatabase) {
  await db.query(
    `SELECT pg_advisory_unlock(
       hashtext($1 || ':' || current_schema())
     )`,
    [DATA_MIGRATION_LOCK],
  );
}

async function ledgerExists(db: DataMigrationDatabase) {
  const result = await db.query(
    `SELECT to_regclass('data_migrations') IS NOT NULL AS "exists"`,
  );
  return booleanValue(result.rows[0]?.exists);
}

async function readLedger(
  db: DataMigrationDatabase,
  migrations: readonly ResolvedDataMigration[],
) {
  if (!(await ledgerExists(db))) {
    throw new Error(
      `The data_migrations ledger is missing; run ${DATA_MIGRATION_RECOVERY_COMMAND}.`,
    );
  }
  const result = await db.query(
    `SELECT "id", "checksum", "attempts", "startedAt", "finishedAt", "failedAt", "error"
       FROM "data_migrations"
      WHERE "id" = ANY($1::text[])`,
    [migrations.map((migration) => migration.id)],
  );
  return new Map(result.rows.map((row) => [String(row.id), row]));
}

function assertLedgerChecksum(
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

async function startAttempt(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
) {
  const result = await db.query(
    `INSERT INTO "data_migrations"
       ("id", "checksum", "attempts", "startedAt", "finishedAt", "failedAt", "error")
     VALUES ($1, $2, 1, NOW(), NULL, NULL, NULL)
     ON CONFLICT ("id") DO UPDATE
       SET "checksum" = EXCLUDED."checksum",
           "attempts" = "data_migrations"."attempts" + 1,
           "startedAt" = NOW(),
           "finishedAt" = NULL,
           "failedAt" = NULL,
           "error" = NULL
     WHERE "data_migrations"."finishedAt" IS NULL
     RETURNING "attempts"`,
    [migration.id, migration.checksum],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Could not claim unfinished data migration ${migration.id}.`);
  }
}

async function finishAttempt(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
) {
  const result = await db.query(
    `UPDATE "data_migrations"
        SET "finishedAt" = NOW(), "failedAt" = NULL, "error" = NULL
      WHERE "id" = $1 AND "checksum" = $2 AND "finishedAt" IS NULL
      RETURNING "id"`,
    [migration.id, migration.checksum],
  );
  if (result.rows.length !== 1) {
    throw new Error(`Could not finish data migration ${migration.id}.`);
  }
}

async function failAttempt(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
  error: unknown,
) {
  await db
    .query(
      `UPDATE "data_migrations"
          SET "failedAt" = NOW(), "error" = $3
        WHERE "id" = $1 AND "checksum" = $2 AND "finishedAt" IS NULL`,
      [migration.id, migration.checksum, errorText(error)],
    )
    .catch(() => undefined);
}

export async function runBlockingDataMigrations(
  db: DataMigrationDatabase,
  registry: readonly ResolvedDataMigration[],
  options: RunOptions,
) {
  const blocking = registry.filter((migration) => migration.blocking);
  if (blocking.length === 0) return;
  const log = options.log ?? console.log;
  await acquireLock(db, {
    lockTimeoutMs: options.lockTimeoutMs ?? 120_000,
    now: options.now ?? Date.now,
    sleep:
      options.sleep ??
      ((milliseconds) =>
        new Promise((resolve) => {
          setTimeout(resolve, milliseconds);
        })),
  });
  try {
    const ledger = await readLedger(db, blocking);
    for (const migration of blocking) {
      const row = ledger.get(migration.id);
      assertLedgerChecksum(migration, row);
      if (row?.finishedAt) {
        await migration.afterFinish?.({ db, log });
        log(`data migration ${migration.id}: already finished`);
        continue;
      }
      await startAttempt(db, migration);
      try {
        await migration.run({ batchSize: options.batchSize, db, log });
        await finishAttempt(db, migration);
        await migration.afterFinish?.({ db, log });
        log(`data migration ${migration.id}: finished`);
      } catch (error) {
        await failAttempt(db, migration, error);
        throw error;
      }
    }
  } finally {
    await releaseLock(db).catch(() => undefined);
  }
}
