import "server-only";

import { bundledMigrationNames } from "@/lib/db/migration-state";
import { prisma } from "@/lib/db/prisma";
import { activeDataMigrationManifest, DATA_MIGRATION_RECOVERY_COMMAND } from "./manifest";

export type MigrationReadiness = "incomplete" | "ready";
type MigrationReadinessFailure = "data-migration" | "prisma-migration";

export type ReadinessDatabase = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

const PRISMA_MIGRATION_RECOVERY_COMMAND = "npx prisma migrate deploy";
const bundledPrismaMigrations = bundledMigrationNames();

async function readAppliedMigrationNames(db: ReadinessDatabase, migrations: readonly string[]) {
  const rows = await db.$queryRawUnsafe<{ migration_name: string }[]>(
    `SELECT "migration_name"
       FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL
        AND "rolled_back_at" IS NULL
        AND "migration_name" = ANY($1::text[])`,
    migrations,
  );
  return new Set(rows.map((row) => row.migration_name));
}

async function readPrismaMigrationReadiness(db: ReadinessDatabase, migrations: readonly string[]) {
  const applied = await readAppliedMigrationNames(db, migrations);
  return migrations.every((migration) => applied.has(migration));
}

/**
 * Bundled Prisma migrations that the target database has not applied yet, in
 * bundle order. Empty means the database is at or ahead of this build.
 */
export async function readPendingPrismaMigrations(
  db: ReadinessDatabase = prisma,
  migrations: readonly string[] = bundledPrismaMigrations,
): Promise<string[]> {
  const applied = await readAppliedMigrationNames(db, migrations);
  return migrations.filter((migration) => !applied.has(migration));
}

/**
 * Active deploy-blocking data migrations that the target database has not
 * completed with a matching checksum, in manifest order. Empty means the
 * ledger satisfies every active entry. A missing ledger table makes all of
 * them pending.
 */
export async function readPendingDataMigrations(db: ReadinessDatabase = prisma): Promise<string[]> {
  const active = activeDataMigrationManifest();
  if (active.length === 0) return [];

  const [ledger] = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('data_migrations') IS NOT NULL AS "exists"`,
  );
  if (ledger?.exists !== true) return active.map((migration) => migration.id);

  const activeIds = active.map((migration) => migration.id);
  const rows = await db.$queryRawUnsafe<
    { checksum: string; finishedAt: Date | null; id: string }[]
  >(
    `SELECT "id", "checksum", "finishedAt"
       FROM "data_migrations"
      WHERE "id" = ANY($1::text[])`,
    activeIds,
  );
  const completed = new Map(rows.map((row) => [row.id, row]));
  return active
    .filter((migration) => {
      const row = completed.get(migration.id);
      return row?.finishedAt == null || row.checksum !== migration.checksum;
    })
    .map((migration) => migration.id);
}

async function readMigrationReadinessFailure(
  db: ReadinessDatabase,
  migrations: readonly string[],
): Promise<MigrationReadinessFailure | null> {
  if (!(await readPrismaMigrationReadiness(db, migrations))) return "prisma-migration";
  return (await readPendingDataMigrations(db)).length > 0 ? "data-migration" : null;
}

export async function readMigrationReadiness(
  db: ReadinessDatabase = prisma,
  migrations: readonly string[] = bundledPrismaMigrations,
): Promise<MigrationReadiness> {
  return (await readMigrationReadinessFailure(db, migrations)) === null ? "ready" : "incomplete";
}

export async function assertMigrationsReady(
  db: ReadinessDatabase = prisma,
  migrations: readonly string[] = bundledPrismaMigrations,
) {
  const failure = await readMigrationReadinessFailure(db, migrations);
  if (failure === "prisma-migration") {
    throw new Error(
      `Prisma schema migrations are pending; run ${PRISMA_MIGRATION_RECOVERY_COMMAND} before starting the app.`,
    );
  }
  if (failure === "data-migration") {
    throw new Error(
      `Deploy-blocking data migrations are incomplete; run ${DATA_MIGRATION_RECOVERY_COMMAND} before starting the app.`,
    );
  }
}
