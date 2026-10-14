import type { DataMigrationDatabase, ResolvedDataMigration } from "./types";

/** Read the actual deployment ledger, rather than inferring readiness from filenames. */
export async function readyDataMigrations(
  db: DataMigrationDatabase,
  migrations: readonly ResolvedDataMigration[],
  deferUnready: boolean,
) {
  const applied = await db.query(
    `SELECT migration_name FROM "_prisma_migrations"
     WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`,
  );
  const names = new Set(applied.rows.map((row) => row.migration_name));
  const unready = migrations.filter((migration) =>
    !names.has(migration.prerequisiteSchemaMigrationId),
  );
  if (!deferUnready && unready.length) {
    throw new Error(`Data migration prerequisite is not applied: ${unready[0].prerequisiteSchemaMigrationId}.`);
  }
  return migrations.filter((migration) => names.has(migration.prerequisiteSchemaMigrationId));
}
