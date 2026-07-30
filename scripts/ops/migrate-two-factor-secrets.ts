#!/usr/bin/env -S npx tsx

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { resolveAuthCryptoKey } from "@/lib/auth/secret";
import {
  migrateLegacyTwoFactorSecrets,
  type TwoFactorMigrationRow,
  type TwoFactorMigrationStore,
} from "@/lib/auth/two-factor-migration";
import { databaseConnectionConfig } from "@/lib/db/pool-config";
import pg from "pg";

const { Client } = pg;

type MigrationDatabase = {
  connect: () => Promise<unknown>;
  end: () => Promise<void>;
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rowCount: number | null; rows: Array<Record<string, unknown>> }>;
};

export function parseTwoFactorMigrationOptions(args: string[] = process.argv.slice(2)) {
  const parsed = parseArgs({
    args,
    options: {
      "batch-size": { type: "string" },
      "dry-run": { type: "boolean" },
      "id-prefix": { type: "string" },
    },
    strict: true,
  });
  const batchSize = Number(parsed.values["batch-size"] ?? 100);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 1_000) {
    throw new Error("--batch-size must be between 1 and 1000.");
  }
  return {
    batchSize,
    dryRun: parsed.values["dry-run"] ?? false,
    idPrefix: parsed.values["id-prefix"]?.trim() || null,
  };
}

export function createTwoFactorMigrationStore(
  db: Pick<MigrationDatabase, "query">,
): TwoFactorMigrationStore {
  return {
    async compareAndSwap(row, replacement) {
      const result = await db.query(
        `UPDATE "twoFactor"
         SET "secret" = $1, "backupCodes" = $2, "updatedAt" = NOW()
         WHERE "id" = $3 AND "secret" = $4 AND "backupCodes" = $5`,
        [replacement.secret, replacement.backupCodes, row.id, row.secret, row.backupCodes],
      );
      return result.rowCount === 1;
    },
    async listBatch(cursor, batchSize, idPrefix) {
      const result = await db.query(
        `SELECT "id", "secret", "backupCodes"
         FROM "twoFactor"
         WHERE ($1::text IS NULL OR "id" > $1)
           AND ($3::text IS NULL OR "id" LIKE $3 || '%')
         ORDER BY "id" ASC
         LIMIT $2`,
        [cursor, batchSize, idPrefix],
      );
      return result.rows.map(
        (row): TwoFactorMigrationRow => ({
          backupCodes: String(row.backupCodes),
          id: String(row.id),
          secret: String(row.secret),
        }),
      );
    },
  };
}

async function main() {
  const options = parseTwoFactorMigrationOptions();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  }) as MigrationDatabase;
  await db.connect();
  try {
    const counts = await migrateLegacyTwoFactorSecrets(createTwoFactorMigrationStore(db), {
      ...options,
      key: resolveAuthCryptoKey(),
    });
    console.log(
      `${options.dryRun ? "Dry run" : "Migration"}: scanned=${counts.scanned} eligibleRows=${counts.eligibleRows} encryptedValues=${counts.encryptedValues} migratedRows=${counts.migratedRows} skippedRows=${counts.skippedRows} concurrent=${counts.concurrent}`,
    );
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Two-factor migration failed.");
    process.exitCode = 1;
  });
}
