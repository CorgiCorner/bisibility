import { publicIdV3CutoverMetadata } from "./definitions/20260729213000_public_id_v3_cutover";

export const DATA_MIGRATION_RECOVERY_COMMAND = "npm run db:migrate";

export type DataMigrationManifestEntry = {
  checksum: string;
  contractMigrationId: string;
  execution: "deploy-blocking";
  id: string;
  lifecycle: "active" | "retired";
  prerequisiteSchemaMigrationId: string;
};

export const dataMigrationManifest: readonly DataMigrationManifestEntry[] = [
  {
    checksum: "396deeba223f6d6d9bfacc8f5f15b4972fef65e2c877f82761448fcf65f27f1a",
    contractMigrationId: publicIdV3CutoverMetadata.blocksSchemaMigration,
    execution: "deploy-blocking",
    id: publicIdV3CutoverMetadata.id,
    lifecycle: "retired",
    prerequisiteSchemaMigrationId: publicIdV3CutoverMetadata.requiresSchemaThrough,
  },
];

export function activeDataMigrationManifest() {
  return dataMigrationManifest.filter((migration) => migration.lifecycle === "active");
}
