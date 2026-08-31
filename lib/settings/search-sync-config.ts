import {
  type SearchSyncPace,
  type SearchSyncRetentionMonths,
  searchSyncPlanSummary,
} from "@/lib/search-insights/sync/plan";

type SearchSyncOverrides = {
  searchSyncImportMonths?: number | null;
  searchSyncPace?: string | null;
};
type SearchSyncEnvironment = { SEARCH_SYNC_IMPORT_MONTHS?: string; SEARCH_SYNC_PACE?: string };

export const SEARCH_SYNC_RETENTION_OPTIONS = [16, 12, 6, 3] as const;
export const SEARCH_SYNC_PACE_OPTIONS = ["normal", "gentle"] as const;

function retentionMonths(value: unknown): SearchSyncRetentionMonths {
  return SEARCH_SYNC_RETENTION_OPTIONS.includes(value as SearchSyncRetentionMonths)
    ? (value as SearchSyncRetentionMonths)
    : 16;
}

function pace(value: unknown): SearchSyncPace {
  return value === "gentle" ? "gentle" : "normal";
}

export function resolveSearchSyncSettings(
  overrides: SearchSyncOverrides | null | undefined,
  env: SearchSyncEnvironment = process.env as SearchSyncEnvironment,
) {
  return {
    retentionMonths: retentionMonths(
      overrides?.searchSyncImportMonths ?? Number(env.SEARCH_SYNC_IMPORT_MONTHS),
    ),
    pace: pace(overrides?.searchSyncPace ?? env.SEARCH_SYNC_PACE),
  };
}

export function searchSyncPreflightPlan(settings: ReturnType<typeof resolveSearchSyncSettings>) {
  const summary = searchSyncPlanSummary(settings);
  return {
    pace: settings.pace,
    retentionMonths: settings.retentionMonths,
    daysTotal: summary.daysTotal,
  };
}
