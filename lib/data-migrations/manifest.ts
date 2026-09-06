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
    checksum: "c2c02bd144e0e075e672ab180522c00837eba3c48fb8cd2b83ee64848b6a060e",
    contractMigrationId: "20261001010000_drop_keyword_schedules",
    execution: "deploy-blocking",
    id: "20260902033000_keyword_schedules_to_check_schedules",
    lifecycle: "active",
    prerequisiteSchemaMigrationId: "20260902030000_rank_check_runs",
  },
  {
    checksum: "db73e85f34f3f3b9e1aa27a20f7f4138a822bb42374306db63e5dca6ef3d133a",
    contractMigrationId: "20261001010000_drop_keyword_schedules",
    execution: "deploy-blocking",
    id: "20260904210000_run_start_semantics",
    lifecycle: "active",
    prerequisiteSchemaMigrationId: "20260902030000_rank_check_runs",
  },
];

export function activeDataMigrationManifest() {
  return dataMigrationManifest.filter((migration) => migration.lifecycle === "active");
}
