#!/usr/bin/env -S node --experimental-transform-types

import { pathToFileURL } from "node:url";
import { dataMigrationManifest } from "@/lib/data-migrations/manifest";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import pg from "pg";
import { activeDataMigrationImplementations } from "./registry";
import { resolveActiveDataMigrations } from "./resolver";
import { runActiveDataMigrations } from "./runner";
import type { DataMigrationDatabase } from "./types";

const { Client } = pg;

type MigrationDatabaseEnvironment = {
  DATABASE_URL?: string;
  DIRECT_URL?: string;
};

export function migrationDatabaseUrl(
  env: MigrationDatabaseEnvironment = {
    DATABASE_URL: process.env.DATABASE_URL,
    DIRECT_URL: process.env.DIRECT_URL,
  },
) {
  const url = env.DIRECT_URL ?? env.DATABASE_URL;
  if (!url?.trim()) throw new Error("DIRECT_URL or DATABASE_URL is required.");
  return url;
}

export function dataMigrationBatchSize(value = process.env.DATA_MIGRATION_BATCH_SIZE) {
  const batchSize = Number(value ?? 200);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("DATA_MIGRATION_BATCH_SIZE must be between 1 and 1000.");
  }
  return batchSize;
}

export function dataMigrationLockTimeoutMs(
  value = process.env.DATA_MIGRATION_LOCK_TIMEOUT_SECONDS,
) {
  const seconds = Number(value ?? 120);
  if (!Number.isInteger(seconds) || seconds < 1 || seconds > 600) {
    throw new Error(
      "DATA_MIGRATION_LOCK_TIMEOUT_SECONDS must be between 1 and 600.",
    );
  }
  return seconds * 1_000;
}

export async function runDataMigrations() {
  const migrations = await resolveActiveDataMigrations(
    dataMigrationManifest,
    activeDataMigrationImplementations,
  );
  if (migrations.length === 0) return;
  const url = migrationDatabaseUrl();
  const db = new Client({
    connectionString: url,
    ...databaseConnectionConfig(url),
  });
  await db.connect();
  try {
    await runActiveDataMigrations(
      db as unknown as DataMigrationDatabase,
      migrations,
      {
        batchSize: dataMigrationBatchSize(),
        lockTimeoutMs: dataMigrationLockTimeoutMs(),
      },
    );
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  runDataMigrations().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
