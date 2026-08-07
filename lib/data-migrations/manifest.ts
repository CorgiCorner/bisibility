export const DATA_MIGRATION_RECOVERY_COMMAND = "npm run db:migrate";

export type DataMigrationManifestEntry = {
  checksum: string;
  contractMigrationId: string;
  execution: "deploy-blocking";
  id: string;
  lifecycle: "active" | "retired";
  prerequisiteSchemaMigrationId: string;
};

export const dataMigrationManifest: readonly DataMigrationManifestEntry[] = [];

export function activeDataMigrationManifest() {
  return dataMigrationManifest.filter((migration) => migration.lifecycle === "active");
}
