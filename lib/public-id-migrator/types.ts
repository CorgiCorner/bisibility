import type { makePublicId } from "@/lib/db/public-id";

export type PublicIdMigrationDatabase = {
  query: (
    sql: string,
    values?: readonly unknown[],
  ) => Promise<{ rowCount?: number | null; rows: Array<Record<string, unknown>> }>;
};

export type PublicIdMigrationOptions = {
  batchSize: number;
  dryRun?: boolean;
  makeId?: typeof makePublicId;
  stopAfter?: number;
};

export type PublicIdMigrationResult = {
  migrated: number;
  reservations: number;
  revokedCredentials: number;
  rewritten: number;
  scanned: number;
};
