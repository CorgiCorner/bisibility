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
  {
    checksum: "f3d9874cf0e546515b3d0a6a8947b1ad8670d270b5a7e83d50584a6b8b7d2b28",
    contractMigrationId: "20261011050000_drop_project_spending_cap",
    execution: "deploy-blocking",
    id: "20261011021000_accounting_history",
    lifecycle: "active",
    prerequisiteSchemaMigrationId: "20261011020000_accounting_history_snapshot",
  },
];

export function activeDataMigrationManifest() {
  return dataMigrationManifest.filter((migration) => migration.lifecycle === "active");
}
