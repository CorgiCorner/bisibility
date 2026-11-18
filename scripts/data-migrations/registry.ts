import { keywordSchedulesToCheckSchedulesMigration } from "./20260902033000_keyword_schedules_to_check_schedules";
import { runStartSemanticsMigration } from "./20260904210000_run_start_semantics";
import { accountingHistoryMigration } from "./20261011021000_accounting_history";
import { legacyWebPolicyMigration } from "./20261013000000_legacy_web_policy";
import { legacyNotificationQuarantineMigration } from "./20261104061000_legacy_notification_quarantine";
import { projectSyncPausesMigration } from "./20261117213100_project_sync_pauses";
import type { DataMigrationImplementation } from "./types";

export const activeDataMigrationImplementations = [
  keywordSchedulesToCheckSchedulesMigration,
  runStartSemanticsMigration,
  accountingHistoryMigration,
  legacyWebPolicyMigration,
  legacyNotificationQuarantineMigration,
  projectSyncPausesMigration,
] as const satisfies readonly DataMigrationImplementation[];
