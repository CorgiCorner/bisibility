import { databaseConnectionConfig } from "@/lib/db/pool-config";
import pg from "pg";
import { migrationDatabaseUrl } from "@/scripts/data-migrations/run";

export function requireSupportedPostgresVersion(value: unknown) {
  if (typeof value !== "string" || !/^\d+$/.test(value)) {
    throw new Error("Cannot determine the PostgreSQL version; refusing to run migrations.");
  }
  const version = Number(value);
  if (!Number.isSafeInteger(version)) {
    throw new Error("Cannot determine the PostgreSQL version; refusing to run migrations.");
  }
  if (version < 160000) {
    throw new Error(
      `PostgreSQL 16 or newer is required; this server uses PostgreSQL ${Math.floor(version / 10000)}. Upgrade PostgreSQL before running migrations.`,
    );
  }
}

export async function assertMigrationPostgresVersion() {
  const url = migrationDatabaseUrl();
  const client = new pg.Client({ connectionString: url, ...databaseConnectionConfig(url) });
  try {
    await client.connect();
    const result = await client.query<{ server_version_num: string }>("SHOW server_version_num");
    requireSupportedPostgresVersion(result.rows[0]?.server_version_num);
  } finally {
    await client.end();
  }
}
