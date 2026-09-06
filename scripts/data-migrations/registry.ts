import type { DataMigrationImplementation } from "./types";
import { keywordSchedulesToCheckSchedulesMigration } from "./20260902033000_keyword_schedules_to_check_schedules";
import { runStartSemanticsMigration } from "./20260904210000_run_start_semantics";

export const activeDataMigrationImplementations = [
  keywordSchedulesToCheckSchedulesMigration,
  runStartSemanticsMigration,
] as const satisfies readonly DataMigrationImplementation[];
