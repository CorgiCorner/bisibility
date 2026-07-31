import { readdirSync } from "node:fs";
import { join } from "node:path";
import { prisma } from "./prisma";

export type MigrationSummary = {
  count: number;
  latest: string | null;
};

export type MigrationComparison = "ok" | "unknown" | "worker-ahead" | "worker-behind";

type AppliedMigrationRow = {
  migration_name: string;
};

export async function appliedMigrationSummary(): Promise<MigrationSummary> {
  try {
    const rows = await prisma.$queryRaw<AppliedMigrationRow[]>`
      SELECT "migration_name"
      FROM "_prisma_migrations"
      WHERE "finished_at" IS NOT NULL
      ORDER BY "finished_at" ASC, "migration_name" ASC
    `;
    return { count: rows.length, latest: rows.at(-1)?.migration_name ?? null };
  } catch {
    return { count: 0, latest: null };
  }
}

export function bundledMigrationNames(): string[] {
  return readdirSync(join(process.cwd(), "prisma", "migrations"), {
    withFileTypes: true,
  })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}

export function bundledMigrationSummary(): MigrationSummary {
  try {
    const migrations = bundledMigrationNames();
    return { count: migrations.length, latest: migrations.at(-1) ?? null };
  } catch {
    return { count: 0, latest: null };
  }
}

export function compareMigrationState({
  applied,
  bundled,
}: {
  applied: string | null;
  bundled: string | null;
}): MigrationComparison {
  if (applied === null || bundled === null) return "unknown";
  if (applied === bundled) return "ok";
  return applied > bundled ? "worker-behind" : "worker-ahead";
}
