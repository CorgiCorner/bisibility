import { parseArgs } from "node:util";
import { pathToFileURL } from "node:url";
import { databaseConnectionConfig } from "../../lib/db/pool-config";
import pg from "pg";
import { withWriteBlockedVerification } from "./locked-verification";
import {
  PERSISTED_SECRET_TARGETS,
  type ProviderSecretRotationCounts,
  type ProviderSecretRotationStore,
  type ProviderSecretRow,
  type ProviderSecretTarget,
  rotatePersistedProviderSecrets,
} from "./provider-secret-rotation";

const { Client } = pg;
const MIN_BATCH_SIZE = 1;
const MAX_BATCH_SIZE = 1_000;

type QueryResult = {
  rowCount: number | null;
  rows: Array<Record<string, unknown>>;
};

type RotationDatabase = {
  connect: () => Promise<unknown>;
  end: () => Promise<void>;
  query: (sql: string, values?: readonly unknown[]) => Promise<QueryResult>;
};

export function parseProviderSecretRotationOptions(args: string[] = process.argv.slice(2)) {
  const parsed = parseArgs({
    args,
    options: {
      "batch-size": { type: "string" },
      "dry-run": { type: "boolean" },
      "id-prefix": { type: "string" },
      verify: { type: "boolean" },
    },
    strict: true,
  });
  const batchSize = Number(parsed.values["batch-size"] ?? 100);
  if (
    !Number.isInteger(batchSize) ||
    batchSize < MIN_BATCH_SIZE ||
    batchSize > MAX_BATCH_SIZE
  ) {
    throw new Error(`--batch-size must be between ${MIN_BATCH_SIZE} and ${MAX_BATCH_SIZE}.`);
  }
  const idPrefix = parsed.values["id-prefix"]?.trim() || null;
  const verify = parsed.values.verify ?? false;
  if (verify && idPrefix) {
    throw new Error("--verify requires a complete scan without --id-prefix.");
  }
  if (verify && parsed.values["dry-run"]) throw new Error("Use --verify without --dry-run.");
  return {
    batchSize,
    dryRun: verify || (parsed.values["dry-run"] ?? false),
    idPrefix,
    verify,
  };
}

function quoted(identifier: string) {
  return `"${identifier}"`;
}

export function createProviderSecretRotationStore(
  db: Pick<RotationDatabase, "query">,
  idPrefix: string | null = null,
): ProviderSecretRotationStore {
  return {
    async compareAndSwap(target, row, replacement) {
      const result = await db.query(
        `UPDATE ${quoted(target.table)}
         SET ${quoted(target.column)} = $1, "updatedAt" = NOW()
         WHERE "id" = $2 AND ${quoted(target.column)} = $3`,
        [replacement, row.id, row.encrypted],
      );
      return result.rowCount === 1;
    },
    async listBatch(target, cursor, batchSize) {
      const result = await db.query(
        `SELECT "id", ${quoted(target.column)} AS "encrypted"
         FROM ${quoted(target.table)}
         WHERE ${quoted(target.column)} IS NOT NULL
           AND ($1::text IS NULL OR "id" > $1)
           AND ($3::text IS NULL OR "id" LIKE $3 || '%')
         ORDER BY "id" ASC
         LIMIT $2`,
        [cursor, batchSize, idPrefix],
      );
      return result.rows.map(
        (row): ProviderSecretRow => ({
          encrypted: String(row.encrypted),
          id: String(row.id),
        }),
      );
    },
  };
}

function addCounts(
  total: ProviderSecretRotationCounts,
  current: ProviderSecretRotationCounts,
) {
  for (const key of Object.keys(total) as Array<keyof ProviderSecretRotationCounts>) {
    total[key] += current[key];
  }
}

function printCounts(label: string, counts: ProviderSecretRotationCounts) {
  console.log(
    `${label}: scanned=${counts.scanned} eligible=${counts.eligible} rotated=${counts.rotated} skipped=${counts.skipped} concurrent=${counts.concurrent}`,
  );
}

async function main() {
  const options = parseProviderSecretRotationOptions();
  const databaseUrl = process.env.DATABASE_URL?.trim();
  if (!databaseUrl) throw new Error("DATABASE_URL is required.");

  const db = new Client({
    connectionString: databaseUrl,
    ...databaseConnectionConfig(databaseUrl),
  }) as RotationDatabase;
  await db.connect();
  try {
    const rotate = () =>
      rotatePersistedProviderSecrets(
        createProviderSecretRotationStore(db, options.idPrefix),
        options,
      );
    const verifyAndReturn = async () => {
      const verified = await rotate();
      const total = sumCounts(verified);
      if (total.eligible !== 0 || total.concurrent !== 0) {
        throw new Error("Provider secret verification found values outside the primary key.");
      }
      return verified;
    };
    const results = options.verify
      ? await withWriteBlockedVerification(
          db,
          PERSISTED_SECRET_TARGETS.map((target) => target.table),
          verifyAndReturn,
        )
      : await rotate();
    const total = sumCounts(results);
    for (const [target, counts] of results) {
      printCounts(target, counts);
    }
    printCounts(options.verify ? "Verify total" : options.dryRun ? "Dry run total" : "Rotation total", total);
  } finally {
    await db.end();
  }
}

function sumCounts(results: Map<string, ProviderSecretRotationCounts>) {
  const total: ProviderSecretRotationCounts = {
    concurrent: 0,
    eligible: 0,
    rotated: 0,
    scanned: 0,
    skipped: 0,
  };
  for (const counts of results.values()) {
    addCounts(total, counts);
  }
  return total;
}

// OAuth state, pending Google OAuth, and Slack install-state cookies are
// short-lived envelopes rather than persisted database rotation targets.
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Provider secret rotation failed.");
    process.exitCode = 1;
  });
}
