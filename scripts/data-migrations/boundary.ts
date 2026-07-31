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

export async function lintDataMigrationReleaseBoundaries(
  root: string,
  manifest: readonly DataMigrationManifestEntry[],
  fileSystem: BoundaryFileSystem = realFileSystem,
) {
  for (const entry of manifest) {
    if (
      !(
        entry.prerequisiteSchemaMigrationId < entry.id &&
        entry.id < entry.contractMigrationId
      )
    ) {
      throw new Error(
        `Data migration ${entry.id} must be ordered after ${entry.prerequisiteSchemaMigrationId} and before ${entry.contractMigrationId}.`,
      );
    }
    const prerequisite = join(
      root,
      "prisma",
      "migrations",
      entry.prerequisiteSchemaMigrationId,
      "migration.sql",
    );
    if (!(await fileSystem.exists(prerequisite))) {
      throw new Error(
        `Data migration ${entry.id} requires missing schema migration ${entry.prerequisiteSchemaMigrationId}.`,
      );
    }

    const contract = join(
      root,
      "prisma",
      "migrations",
      entry.contractMigrationId,
      "migration.sql",
    );
    const contractExists = await fileSystem.exists(contract);
    if (entry.lifecycle === "active") {
      if (contractExists) {
        throw new Error(
          `Active data migration ${entry.id} must not ship contract schema migration ${entry.contractMigrationId}.`,
        );
      }
      continue;
    }
    if (!contractExists) {
      throw new Error(
        `Enforced data migration ${entry.id} requires schema migration ${entry.contractMigrationId}.`,
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
          `Schema migration ${entry.contractMigrationId} is missing self-guard lint marker: ${requirement}.`,
        );
      }
    }
  }
}
