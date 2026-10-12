import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import pg from "pg";
import { assertAccountingCutoverNamespace } from "./accounting-cutover-preflight";
import { migrationDatabaseUrl } from "../data-migrations/run";
import type { DataMigrationDatabase } from "../data-migrations/types";

export async function readCompletedDataMigrations(db: DataMigrationDatabase) {
  const { rows: tables } = await db.query("SELECT to_regclass('data_migrations') IS NOT NULL AS present");
  if (tables[0]?.present !== true) return new Set<string>();
  const { rows } = await db.query('SELECT id, checksum, "finishedAt" FROM data_migrations');
  return new Set(dataMigrationManifest.filter((entry) => rows.some((row) =>
    row.id === entry.id && row.checksum === entry.checksum && row.finishedAt != null,
  )).map((entry) => entry.id));
}

export async function completedDataMigrations() {
  const url = migrationDatabaseUrl();
  const db = new pg.Client({ connectionString: url, ...databaseConnectionConfig(url) });
  await db.connect();
  try {
    await assertAccountingCutoverNamespace(db as unknown as DataMigrationDatabase, process.env.METERING_NAMESPACE ?? "default");
    return await readCompletedDataMigrations(db as unknown as DataMigrationDatabase);
  } finally {
    await db.end();
  }
}
