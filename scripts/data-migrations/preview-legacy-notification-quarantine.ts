#!/usr/bin/env -S node --experimental-transform-types

import { databaseConnectionConfig } from "@/lib/db/pool-config";
import pg from "pg";
import { previewLegacyNotificationQuarantine } from "./20261104061000_legacy_notification_quarantine";
import { migrationDatabaseUrl } from "./run";

// Run after the prerequisite schema migration, before the deploy-blocking backfill.
async function main() {
  const url = migrationDatabaseUrl();
  const db = new pg.Client({ connectionString: url, ...databaseConnectionConfig(url) });
  await db.connect();
  try {
    const count = await previewLegacyNotificationQuarantine(db);
    console.log(`legacy notification quarantine candidates: ${count}`);
  } finally {
    await db.end();
  }
}

main().catch(() => {
  console.error("Legacy notification quarantine preview failed.");
  process.exitCode = 1;
});
