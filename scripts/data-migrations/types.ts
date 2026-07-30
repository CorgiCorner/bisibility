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

export type DataMigrationDefinition = DataMigrationManifestEntry & {
  afterFinish?: (
    context: Pick<DataMigrationContext, "db" | "log">,
  ) => Promise<void>;
  checksumInputs: readonly {
    label: string;
    url: URL;
  }[];
  run: (context: DataMigrationContext) => Promise<void>;
  sourceUrl: URL;
};

export type ResolvedDataMigration = DataMigrationDefinition & {
  checksum: string;
};
