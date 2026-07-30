import { publicIdV3CutoverMetadata } from "./definitions/20260729213000_public_id_v3_cutover";

export const DATA_MIGRATION_RECOVERY_COMMAND = "npm run db:migrate";

export type DataMigrationMetadata = {
  blocking: boolean;
  blocksSchemaMigration: string;
  contractState: "enforced" | "pending";
  id: string;
  requiresSchemaThrough: string;
  writeGatePhase?: string;
};

export type DataMigrationManifestEntry = DataMigrationMetadata & {
  checksum: string;
};

export const dataMigrationManifest = [
  {
    ...publicIdV3CutoverMetadata,
    blocking: false,
    checksum: "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a",
    contractState: "enforced",
  },
] as const satisfies readonly DataMigrationManifestEntry[];

export function blockingDataMigrationManifest() {
  return dataMigrationManifest.filter((migration) => migration.blocking);
}
