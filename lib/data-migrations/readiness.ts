import "server-only";

import { prisma } from "@/lib/db/prisma";
import { readPublicIdContractReadiness } from "@/lib/public-id-contract/readiness";
import { blockingDataMigrationManifest, DATA_MIGRATION_RECOVERY_COMMAND } from "./manifest";

export type MigrationReadiness = "incomplete" | "ready";

type ReadinessDatabase = {
  $queryRawUnsafe<T>(query: string, ...values: unknown[]): Promise<T>;
};

export async function readMigrationReadiness(
  db: ReadinessDatabase = prisma,
): Promise<MigrationReadiness> {
  const blocking = blockingDataMigrationManifest();
  if (blocking.length === 0) {
    return (await readPublicIdContractReadiness(db)) ? "ready" : "incomplete";
  }

  const [ledger] = await db.$queryRawUnsafe<{ exists: boolean }[]>(
    `SELECT to_regclass('data_migrations') IS NOT NULL AS "exists"`,
  );
  if (ledger?.exists !== true) return "incomplete";

  const blockingIds = blocking.map((migration) => migration.id);
  const rows = await db.$queryRawUnsafe<
    { checksum: string; finishedAt: Date | null; id: string }[]
  >(
    `SELECT "id", "checksum", "finishedAt"
       FROM "data_migrations"
      WHERE "id" = ANY($1::text[])`,
    blockingIds,
  );
  const completed = new Map(rows.map((row) => [row.id, row]));
  const dataMigrationsReady = blocking.every((migration) => {
    const row = completed.get(migration.id);
    return row?.finishedAt != null && row.checksum === migration.checksum;
  });
  return dataMigrationsReady && (await readPublicIdContractReadiness(db)) ? "ready" : "incomplete";
}

export async function assertMigrationsReady(db?: ReadinessDatabase) {
  const readiness = await readMigrationReadiness(db);
  if (readiness !== "ready") {
    throw new Error(
      `The public ID final database contract is incomplete; run ${DATA_MIGRATION_RECOVERY_COMMAND} before starting the app.`,
    );
  }
}
