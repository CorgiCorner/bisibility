import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { basename, extname } from "node:path";
import type { DataMigrationManifestEntry } from "@/lib/data-migrations/manifest";
import type {
  DataMigrationChecksumInput,
  DataMigrationImplementation,
  ResolvedDataMigration,
} from "./types";

const DATA_MIGRATION_ID = /^\d{14}_[a-z0-9]+(?:_[a-z0-9]+)*$/;
const CHECKSUM = /^[a-f0-9]{64}$/;

function validateManifest(manifest: readonly DataMigrationManifestEntry[]) {
  const seen = new Set<string>();
  let previous = "";
  for (const migration of manifest) {
    if (!DATA_MIGRATION_ID.test(migration.id)) {
      throw new Error(`Invalid data migration ID: ${migration.id}.`);
    }
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate data migration manifest ID: ${migration.id}.`);
    }
    if (previous && migration.id <= previous) {
      throw new Error("Data migration manifest must be in strict timestamp order.");
    }
    if (!CHECKSUM.test(migration.checksum)) {
      throw new Error(`Data migration ${migration.id} has an invalid checksum.`);
    }
    if (
      !(
        migration.prerequisiteSchemaMigrationId < migration.id &&
        migration.id < migration.contractMigrationId
      )
    ) {
      throw new Error(`Data migration ${migration.id} has invalid schema boundaries.`);
    }
    seen.add(migration.id);
    previous = migration.id;
  }
}

function compareInputs(
  left: DataMigrationChecksumInput,
  right: DataMigrationChecksumInput,
) {
  if (left.label !== right.label) return left.label < right.label ? -1 : 1;
  if (left.url.href === right.url.href) return 0;
  return left.url.href < right.url.href ? -1 : 1;
}

function validateChecksumInputs(migration: DataMigrationImplementation) {
  if (migration.checksumInputs.length === 0) {
    throw new Error(`Data migration ${migration.id} must declare checksum inputs.`);
  }
  const labels = new Set<string>();
  const urls = new Set<string>();
  for (const input of migration.checksumInputs) {
    if (!input.label || input.label !== input.label.trim()) {
      throw new Error(`Data migration ${migration.id} has an invalid checksum input label.`);
    }
    if (labels.has(input.label)) {
      throw new Error(`Data migration ${migration.id} has duplicate checksum input labels.`);
    }
    if (urls.has(input.url.href)) {
      throw new Error(`Data migration ${migration.id} has duplicate checksum input URLs.`);
    }
    labels.add(input.label);
    urls.add(input.url.href);
  }
  const sourceCount = migration.checksumInputs.filter(
    (input) => input.url.href === migration.sourceUrl.href,
  ).length;
  if (sourceCount !== 1 || migration.checksumInputs[0]?.url.href !== migration.sourceUrl.href) {
    throw new Error(
      `Data migration ${migration.id} source must be the first checksum input exactly once.`,
    );
  }
  const remaining = migration.checksumInputs.slice(1);
  const sorted = [...remaining].sort(compareInputs);
  if (remaining.some((input, index) => input !== sorted[index])) {
    throw new Error(`Data migration ${migration.id} checksum inputs must be sorted.`);
  }
}

function validateImplementations(
  implementations: readonly DataMigrationImplementation[],
) {
  const seen = new Set<string>();
  for (const migration of implementations) {
    if (!DATA_MIGRATION_ID.test(migration.id)) {
      throw new Error(`Invalid data migration implementation ID: ${migration.id}.`);
    }
    if (seen.has(migration.id)) {
      throw new Error(`Duplicate data migration implementation ID: ${migration.id}.`);
    }
    const sourceName = basename(migration.sourceUrl.pathname, extname(migration.sourceUrl.pathname));
    if (sourceName !== migration.id) {
      throw new Error(`Data migration source filename does not match ${migration.id}.`);
    }
    validateChecksumInputs(migration);
    seen.add(migration.id);
  }
}

export async function computeDataMigrationChecksum(
  migration: Pick<DataMigrationImplementation, "checksumInputs">,
) {
  const hash = createHash("sha256");
  for (const input of migration.checksumInputs) {
    hash.update(input.label);
    hash.update("\0");
    hash.update(await readFile(input.url));
    hash.update("\0");
  }
  return hash.digest("hex");
}

export async function resolveActiveDataMigrations(
  manifest: readonly DataMigrationManifestEntry[],
  implementations: readonly DataMigrationImplementation[],
): Promise<ResolvedDataMigration[]> {
  validateManifest(manifest);
  validateImplementations(implementations);
  const metadata = new Map(manifest.map((migration) => [migration.id, migration]));
  const implementationById = new Map(
    implementations.map((migration) => [migration.id, migration]),
  );

  for (const implementation of implementations) {
    const entry = metadata.get(implementation.id);
    if (!entry) {
      throw new Error(`Data migration implementation ${implementation.id} has no manifest entry.`);
    }
    if (entry.lifecycle !== "active") {
      throw new Error(`Retired data migration ${implementation.id} must not have an implementation.`);
    }
  }

  const active = manifest.filter(
    (migration) =>
      migration.lifecycle === "active" && migration.execution === "deploy-blocking",
  );
  return Promise.all(
    active.map(async (entry) => {
      const implementation = implementationById.get(entry.id);
      if (!implementation) {
        throw new Error(`Active data migration ${entry.id} has no implementation.`);
      }
      const checksum = await computeDataMigrationChecksum(implementation);
      if (checksum !== entry.checksum) {
        throw new Error(
          `Data migration checksum mismatch for ${entry.id}; create a new migration instead of editing its implementation inputs.`,
        );
      }
      return { ...entry, ...implementation };
    }),
  );
}
