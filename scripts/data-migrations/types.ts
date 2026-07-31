import type { DataMigrationManifestEntry } from "@/lib/data-migrations/manifest";

export type DataMigrationDatabase = {
  query(
    sql: string,
    values?: readonly unknown[],
  ): Promise<{ rows: Record<string, unknown>[] }>;
};

export type DataMigrationContext = {
  batchSize: number;
  db: DataMigrationDatabase;
  log: (message: string) => void;
};

export type DataMigrationChecksumInput = {
  label: string;
  url: URL;
};

export type DataMigrationImplementation = {
  checksumInputs: readonly DataMigrationChecksumInput[];
  finalize?: (context: Pick<DataMigrationContext, "db" | "log">) => Promise<void>;
  id: string;
  run: (context: DataMigrationContext) => Promise<void>;
  sourceUrl: URL;
};

/**
 * Immutable adapter for historical migration modules. New migrations use
 * DataMigrationImplementation and keep lifecycle metadata in the manifest.
 */
export type DataMigrationDefinition = {
  afterFinish?: (
    context: Pick<DataMigrationContext, "db" | "log">,
  ) => Promise<void>;
  blocking: boolean;
  blocksSchemaMigration: string;
  checksum: string;
  checksumInputs: readonly DataMigrationChecksumInput[];
  id: string;
  requiresSchemaThrough: string;
  run: (context: DataMigrationContext) => Promise<void>;
  sourceUrl: URL;
  writeGatePhase?: string;
};

export type ResolvedDataMigration = DataMigrationManifestEntry & DataMigrationImplementation;
