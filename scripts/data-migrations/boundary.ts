import { access, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { DataMigrationManifestEntry } from "@/lib/data-migrations/manifest";

type BoundaryFileSystem = {
  exists: (path: string) => Promise<boolean>;
  read: (path: string) => Promise<string>;
};

const realFileSystem: BoundaryFileSystem = {
  async exists(path) {
    try {
      await access(path);
      return true;
    } catch {
      return false;
    }
  },
  read: (path) => readFile(path, "utf8"),
};

export async function validateDataMigrationBoundaries(
  root: string,
  manifest: readonly DataMigrationManifestEntry[],
  fileSystem: BoundaryFileSystem = realFileSystem,
) {
  for (const entry of manifest) {
    if (
      !(
        entry.requiresSchemaThrough < entry.id &&
        entry.id < entry.blocksSchemaMigration
      )
    ) {
      throw new Error(
        `Data migration ${entry.id} must be ordered after ${entry.requiresSchemaThrough} and before ${entry.blocksSchemaMigration}.`,
      );
    }
    const prerequisite = join(
      root,
      "prisma",
      "migrations",
      entry.requiresSchemaThrough,
      "migration.sql",
    );
    if (!(await fileSystem.exists(prerequisite))) {
      throw new Error(
        `Data migration ${entry.id} requires missing schema migration ${entry.requiresSchemaThrough}.`,
      );
    }

    const contract = join(
      root,
      "prisma",
      "migrations",
      entry.blocksSchemaMigration,
      "migration.sql",
    );
    const contractExists = await fileSystem.exists(contract);
    if (entry.contractState === "pending") {
      if (contractExists) {
        throw new Error(
          `Pending data migration ${entry.id} must not ship blocking schema migration ${entry.blocksSchemaMigration}.`,
        );
      }
      continue;
    }
    if (!contractExists) {
      throw new Error(
        `Enforced data migration ${entry.id} requires schema migration ${entry.blocksSchemaMigration}.`,
      );
    }
    const sql = await fileSystem.read(contract);
    for (const requirement of [
      "-- data-migration-contract: self-guarding",
      "SET lock_timeout",
      "RAISE EXCEPTION",
    ]) {
      if (!sql.includes(requirement)) {
        throw new Error(
          `Schema migration ${entry.blocksSchemaMigration} is missing self-guard requirement: ${requirement}.`,
        );
      }
    }
  }
}
