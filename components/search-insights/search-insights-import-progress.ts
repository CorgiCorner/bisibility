import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";

/** None of these is an error: active import work is a limitation, while pauses can retry. */
export type ImportProgressState =
  | "done"
  | "none"
  | "paused"
  | "running"
  | "waiting"
  | "waiting_for_first_data";

export type ImportProgress = {
  consecutiveDays: number;
  daysTotal: number;
  earliestTargetDate: string | null;
  firstDataDate: string | null;
  lastActivityAt: string | null;
  monthsSaved: number;
  newestFinalizedDate: string | null;
  percent: number;
  state: ImportProgressState;
};

const SETTLED_STATES: Record<string, ImportProgressState> = {
  completed: "done",
  // A workflow that gave up is re-armed by the next render past the restart window, so it is
  // a pause that resumes on its own rather than a failure the customer has to act on.
  failed: "paused",
  paused: "paused",
};

export function importProgress(
  row: SearchInsightsImportState | null,
  facts?: ImportObservabilityFacts | null,
): ImportProgress {
  if (!row)
    return {
      consecutiveDays: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      firstDataDate: null,
      lastActivityAt: null,
      monthsSaved: 0,
      newestFinalizedDate: null,
      percent: 0,
      state: "none",
    };
  const consecutiveDays = facts?.consecutiveDays ?? 0;
  const completedMonths = facts?.deepHistoryMonths.completed ?? 0;
  const targetMonths = facts?.deepHistoryMonths.target ?? row.plannedRetentionMonths ?? 16;
  const share = targetMonths > 0 ? Math.min(1, completedMonths / targetMonths) : 0;
  return {
    consecutiveDays,
    daysTotal: row.daysTotal,
    earliestTargetDate: row.earliestTargetDate,
    firstDataDate: row.firstDataDate ?? null,
    lastActivityAt: facts?.lastActivityAt ?? null,
    monthsSaved: completedMonths,
    newestFinalizedDate: row.newestFinalizedDate,
    percent: Math.round(share * 100),
    state:
      row.state === "waiting_for_first_data"
        ? "waiting_for_first_data"
        : (SETTLED_STATES[row.state] ?? "running"),
  };
}

const PROGRESS_WIDTHS = [
  "w-0",
  "w-1/12",
  "w-2/12",
  "w-3/12",
  "w-4/12",
  "w-5/12",
  "w-6/12",
  "w-7/12",
  "w-8/12",
  "w-9/12",
  "w-10/12",
  "w-11/12",
  "w-full",
] as const;

export function progressWidthClass(percent: number) {
  const steps = PROGRESS_WIDTHS.length - 1;
  const index = Math.round((Math.min(100, Math.max(0, percent)) / 100) * steps);
  return PROGRESS_WIDTHS[index];
}
