import {
  assertDataMigrationChecksum,
  completeRun,
  failFinalization,
  failRun,
  finishMigration,
  readDataMigrationLedger,
  startFinalizationAttempt,
  startRunAttempt,
} from "./ledger";
import type { DataMigrationDatabase, ResolvedDataMigration } from "./types";

const DATA_MIGRATION_LOCK = "bisibility-data-migrations";
const LOCK_RETRY_INITIAL_MS = 250;
const LOCK_RETRY_MAX_MS = 5_000;

type RunOptions = {
  batchSize: number;
  lockTimeoutMs?: number;
  log?: (message: string) => void;
  now?: () => number;
  sleep?: (milliseconds: number) => Promise<void>;
};

function booleanValue(value: unknown) {
  return value === true;
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
        "Timed out waiting for the deploy-blocking data migration lock. Verify the active migration process, then rerun npm run db:migrate.",
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

async function runMigrationWork(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
  options: RunOptions,
  log: (message: string) => void,
) {
  await startRunAttempt(db, migration);
  try {
    await migration.run({ batchSize: options.batchSize, db, log });
    await completeRun(db, migration);
    log(`data migration ${migration.id}: work completed`);
  } catch (error) {
    await failRun(db, migration, error);
    throw error;
  }
}

async function finalizeMigration(
  db: DataMigrationDatabase,
  migration: ResolvedDataMigration,
  log: (message: string) => void,
) {
  if (!migration.finalize) return;
  await startFinalizationAttempt(db, migration);
  try {
    await migration.finalize({ db, log });
  } catch (error) {
    await failFinalization(db, migration, error);
    throw error;
  }
}

export async function runActiveDataMigrations(
  db: DataMigrationDatabase,
  migrations: readonly ResolvedDataMigration[],
  options: RunOptions,
) {
  if (migrations.length === 0) return;
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
    const ledger = await readDataMigrationLedger(db, migrations);
    for (const migration of migrations) {
      const row = ledger.get(migration.id);
      assertDataMigrationChecksum(migration, row);
      if (row?.finishedAt) {
        log(`data migration ${migration.id}: already finished`);
        continue;
      }
      if (!row) {
        await runMigrationWork(db, migration, options, log);
      } else if (!row.runCompletedAt) {
        throw new Error(
          `Data migration run ${migration.id} was already attempted and must not be rerun.`,
        );
      } else {
        log(`data migration ${migration.id}: work already completed`);
      }
      await finalizeMigration(db, migration, log);
      await finishMigration(db, migration);
      log(`data migration ${migration.id}: finished`);
    }
  } finally {
    await releaseLock(db).catch(() => undefined);
  }
}
