import { keywordSchedulesToCheckSchedulesMigration } from "./20260902033000_keyword_schedules_to_check_schedules";
import { runStartSemanticsMigration } from "./20260904210000_run_start_semantics";
import { accountingHistoryMigration } from "./20261011021000_accounting_history";
import type { DataMigrationImplementation } from "./types";

export const activeDataMigrationImplementations = [
  keywordSchedulesToCheckSchedulesMigration,
  runStartSemanticsMigration,
  accountingHistoryMigration,
] as const satisfies readonly DataMigrationImplementation[];
