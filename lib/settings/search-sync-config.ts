import {
  SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY,
  type SearchSyncPace,
  type SearchSyncRetentionMonths,
  searchSyncPlanSummary,
  searchSyncRequestSetsPerHour,
} from "@/lib/search-insights/sync/plan";

type SearchSyncOverrides = {
  searchSyncImportMonths?: number | null;
  searchSyncPace?: string | null;
};
type SearchSyncEnvironment = { SEARCH_SYNC_IMPORT_MONTHS?: string; SEARCH_SYNC_PACE?: string };

export const SEARCH_SYNC_RETENTION_OPTIONS = [16, 12, 6, 3] as const;
export const SEARCH_SYNC_PACE_OPTIONS = ["normal", "gentle"] as const;
export const SEARCH_SYNC_PACE_LABELS: Record<SearchSyncPace, string> = {
  gentle: "Reduced",
  normal: "Standard",
};

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

export function searchSyncRetentionLabel(retentionMonths: SearchSyncRetentionMonths) {
  return `${retentionMonths} months`;
}

export function searchSyncPaceLabel(pace: SearchSyncPace) {
  return SEARCH_SYNC_PACE_LABELS[pace];
}

function searchSyncDurationLabel(hours: number) {
  const minutes = Math.ceil(hours * 60);
  return minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} hr`;
}

export function searchSyncPreflightEstimate(settings: {
  pace: SearchSyncPace;
  retentionMonths: SearchSyncRetentionMonths;
}) {
  const summary = searchSyncPlanSummary(settings);
  const firstViewHours =
    (7 * SEARCH_SYNC_DIMENSIONAL_SETS_PER_DAY) / searchSyncRequestSetsPerHour(settings.pace);
  const fullHistory = summary.duration.replace(/^about\s+/, "");
  return `Importing ${searchSyncRetentionLabel(settings.retentionMonths)} takes ${summary.requests} requests to Google. First view in ~${searchSyncDurationLabel(firstViewHours)}; full history in ~${fullHistory} at ${searchSyncPaceLabel(settings.pace)} speed.`;
}
