#!/usr/bin/env -S node --experimental-transform-types

import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import pg from "pg";
import { databaseConnectionConfig } from "../../lib/db/pool-config.ts";
import { organicDomainRanksFromRaw } from "../../lib/rank-check/organic-ranks.ts";

const { Client } = pg;

type BackfillDatabase = {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rows: Array<Record<string, unknown>> }>;
};

type BackfillOptions = {
  batchSize: number;
  onBatch?: (result: BackfillResult) => void;
};

export type BackfillResult = {
  scanned: number;
  skipped: number;
  updated: number;
};

function batchSizeFrom(value: string | undefined) {
  const batchSize = Number(value ?? 200);
  if (!Number.isInteger(batchSize) || batchSize < 1 || batchSize > 2_000) {
    throw new Error("--batch-size must be an integer between 1 and 2000.");
  }
  return batchSize;
}

export function parseBackfillOptions(args: string[] = process.argv.slice(2)): BackfillOptions {
  const parsed = parseArgs({
    args,
    options: { "batch-size": { type: "string" } },
    strict: true,
  });
  return { batchSize: batchSizeFrom(parsed.values["batch-size"]) };
}

export async function backfillLatestOrganicRanks(
  db: BackfillDatabase,
  options: BackfillOptions,
) {
  const totals: BackfillResult = { scanned: 0, skipped: 0, updated: 0 };
  let keywordCursor: string | null = null;

  while (true) {
    const batch = await db.query(
      `WITH latest AS (
         SELECT DISTINCT ON ("keywordId")
           "id", "keywordId", "organicRanks", "raw"
         FROM "rank_checks"
         WHERE "status" = 'completed'
           AND ($1::text IS NULL OR "keywordId" > $1)
         ORDER BY "keywordId" ASC, "checkedAt" DESC, "id" DESC
       )
       SELECT "id", "keywordId", "raw"
       FROM latest
       WHERE "organicRanks" IS NULL
       ORDER BY "keywordId" ASC
       LIMIT $2`,
      [keywordCursor, options.batchSize],
    );
    if (batch.rows.length === 0) break;

    const current: BackfillResult = { scanned: batch.rows.length, skipped: 0, updated: 0 };
    await db.query("BEGIN");
    try {
      for (const row of batch.rows) {
        const snapshot = organicDomainRanksFromRaw(row.raw);
        if (snapshot === null) {
          current.skipped += 1;
          continue;
        }
        await db.query(
          `UPDATE "rank_checks"
           SET "organicRanks" = $2::jsonb, "updatedAt" = NOW()
           WHERE "id" = $1 AND "organicRanks" IS NULL`,
          [String(row.id), JSON.stringify(snapshot)],
        );
        current.updated += 1;
      }
      await db.query("COMMIT");
    } catch (error) {
      await db.query("ROLLBACK");
      throw error;
    }

    totals.scanned += current.scanned;
    totals.skipped += current.skipped;
    totals.updated += current.updated;
    options.onBatch?.(current);
    keywordCursor = String(batch.rows.at(-1)?.keywordId);
    if (batch.rows.length < options.batchSize) break;
  }

  return totals;
}

function requireDatabaseUrl(env: Record<string, string | undefined> = process.env) {
  const databaseUrl = env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");
  return databaseUrl;
}

async function main() {
  const options = parseBackfillOptions();
  const databaseUrl = requireDatabaseUrl();
  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  });
  await db.connect();
  try {
    const result = await backfillLatestOrganicRanks(db as BackfillDatabase, {
      ...options,
      onBatch: (batch) =>
        console.log(
          `Processed ${batch.scanned} latest checks: ${batch.updated} updated, ${batch.skipped} unavailable.`,
        ),
    });
    console.log(
      `Backfill complete: ${result.scanned} scanned, ${result.updated} updated, ${result.skipped} unavailable.`,
    );
  } finally {
    await db.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  });
}
