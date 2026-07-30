import "server-only";

import { prisma } from "@/lib/db/prisma";

type AppliedMigrationRow = { migration_name: string };

/**
 * Latest applied prisma migration name, or null when the lookup fails.
 * Used by the public migration compatibility preflight; must never throw.
 */
export async function latestFinishedMigration() {
  try {
    const rows = await prisma.$queryRaw<
      AppliedMigrationRow[]
    >`SELECT "migration_name" FROM "_prisma_migrations" WHERE "finished_at" IS NOT NULL ORDER BY "finished_at" DESC, "migration_name" DESC LIMIT 1`;

    return rows[0]?.migration_name ?? null;
  } catch {
    return null;
  }
}
