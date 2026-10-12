import {
  historyMigrationId,
  runHistoricalImport,
  verifyHistoricalImport,
} from "@/lib/metering/history-migration";
import type { Prisma, Sql } from "@/lib/metering/store/sql";
import type {
  DataMigrationContext,
  DataMigrationDatabase,
  DataMigrationImplementation,
} from "./types";

const sourceUrl = new URL(import.meta.url);
function sqlFor(db: DataMigrationDatabase): Sql {
  return {
    async query<T>(query: Prisma.Sql) {
      return (await db.query(query.text, query.values)).rows as T[];
    },
    async execute(query: Prisma.Sql) {
      const result = await db.query(query.text, query.values);
      return (result as { rowCount?: number }).rowCount ?? 0;
    },
  };
}
async function transaction<T>(db: DataMigrationDatabase, body: (sql: Sql) => Promise<T>) {
  await db.query("BEGIN");
  try {
    const result = await body(sqlFor(db));
    await db.query("COMMIT");
    return result;
  } catch (error) {
    await db.query("ROLLBACK").catch(() => undefined);
    throw error;
  }
}
async function run({ db, batchSize, log }: DataMigrationContext) {
  for (;;) {
    const result = await transaction(db, (sql) =>
      runHistoricalImport(sql, process.env.METERING_NAMESPACE ?? "default", batchSize),
    );
    log(`data migration ${historyMigrationId}: processed=${result.processed}`);
    if (result.done) return;
  }
}
const inputs = [
  "lib/metering/history-ai-reference.ts",
  "lib/metering/history-budgets.ts",
  "lib/metering/history-evidence.ts",
  "lib/metering/history-mapping.ts",
  "lib/metering/history-migration.ts",
  "lib/metering/history-types.ts",
  "lib/metering/history-verification.ts",
  "lib/metering/mapping.ts",
  "lib/metering/paid-measurements.ts",
  "lib/metering/paid-quote.ts",
  "lib/metering/spending-limits.ts",
  "lib/metering/store/accounting-lock.ts",
  "lib/metering/store/budgets.ts",
  "lib/metering/store/codec.ts",
  "lib/metering/store/history-validation.ts",
  "lib/metering/store/history.ts",
  "lib/metering/store/records.ts",
  "lib/metering/store/sql.ts",
  "lib/provider-usage/credential-version.ts",
  "lib/provider-usage/surface.ts",
  "lib/providers/allocation-catalog.ts",
  "lib/providers/allocation-metadata.ts",
  "prisma/migrations/20261011020000_accounting_history_snapshot/migration.sql",
];
export const accountingHistoryMigration = {
  id: historyMigrationId,
  sourceUrl,
  replaySafe: true,
  checksumInputs: [
    { label: "migration", url: sourceUrl },
    ...inputs.map((label) => ({ label, url: new URL(`../../${label}`, sourceUrl) })),
  ],
  run,
  async finalize({ db }) {
    await transaction(db, verifyHistoricalImport);
  },
} satisfies DataMigrationImplementation;
