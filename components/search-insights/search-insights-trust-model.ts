import { formatDateLabel, formatPacificTimestampValue } from "@/lib/search-insights/dates";
import type { SearchInsightsImportState } from "@/lib/search-insights/queries/context";
import { FRESHNESS_UNKNOWN, WAITING_FOR_FIRST_DATA } from "./search-insights-copy";

/** None of these is an error: an import in progress is a limitation, a paused one retries. */
export type ImportProgressState =
  | "done"
  | "none"
  | "paused"
  | "running"
  | "waiting"
  | "waiting_for_first_data";

export type ImportProgress = {
  completedDays: number;
  daysTotal: number;
  etaLabel: string | null;
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

export function importProgress(row: SearchInsightsImportState | null): ImportProgress {
  if (!row)
    return {
      completedDays: 0,
      daysTotal: 0,
      earliestTargetDate: null,
      etaLabel: null,
      firstDataDate: null,
      lastActivityAt: null,
      monthsSaved: 0,
      newestFinalizedDate: null,
      percent: 0,
      state: "none",
    };
  const completedDays = row.completedDays ?? 0;
  const share = row.daysTotal > 0 ? Math.min(1, Math.max(0, completedDays / row.daysTotal)) : 0;
  const retentionMonths = row.plannedRetentionMonths ?? 16;
  return {
    completedDays,
    daysTotal: row.daysTotal,
    earliestTargetDate: row.earliestTargetDate,
    etaLabel: row.etaLabel ?? null,
    firstDataDate: row.firstDataDate ?? null,
    lastActivityAt: row.lastActivityAt ?? null,
    monthsSaved: Math.min(retentionMonths, Math.round(share * retentionMonths)),
    newestFinalizedDate: row.newestFinalizedDate,
    percent: Math.round(share * 100),
    state:
      row.state === "waiting_for_first_data"
        ? "waiting_for_first_data"
        : row.waiting && row.state === "running"
          ? "waiting"
          : (SETTLED_STATES[row.state] ?? "running"),
  };
}

/**
 * The import bar is a progress indicator standing beside a sentence that states the exact
 * figure, so it is drawn in twelfths from the spacing scale rather than a computed width: a
 * five pixel step is invisible on a sixty-four pixel bar, and the class exists in the
 * stylesheet instead of being assembled at runtime.
 */
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

export function relativeActivity(value: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export type ImportStartupPresentation = {
  activity: string | null;
  eta: string | null;
  fact: string;
  showHeartbeat: boolean;
  showProgress: boolean;
  state: "active" | "planned" | "starting" | "waiting_for_first_data";
};

export function importStartupPresentation(
  progress: ImportProgress,
  now = new Date(),
): ImportStartupPresentation {
  if (progress.state === "waiting_for_first_data") {
    return {
      activity: null,
      eta: null,
      fact: WAITING_FOR_FIRST_DATA,
      showHeartbeat: false,
      showProgress: false,
      state: "waiting_for_first_data",
    };
  }
  if (progress.daysTotal <= 0) {
    return {
      activity: null,
      eta: null,
      fact: "Waiting for the first data from Google · import starting",
      showHeartbeat: false,
      showProgress: false,
      state: "starting",
    };
  }

  const active = progress.completedDays > 0 || progress.lastActivityAt !== null;
  if (!active) {
    return {
      activity: null,
      eta: null,
      fact: `Waiting for the first data from Google · importing ~${progress.daysTotal} days of history`,
      showHeartbeat: false,
      showProgress: false,
      state: "planned",
    };
  }

  return {
    activity: progress.lastActivityAt
      ? `last activity ${relativeActivity(progress.lastActivityAt, now)}`
      : null,
    eta: progress.etaLabel,
    fact:
      progress.firstDataDate && progress.earliestTargetDate && progress.newestFinalizedDate
        ? `Importing your Google history · ${formatDateLabel(
            progress.firstDataDate > progress.earliestTargetDate
              ? progress.firstDataDate
              : progress.earliestTargetDate,
          )} to ${formatDateLabel(progress.newestFinalizedDate)}`
        : `Importing your Google history · ${progress.completedDays} of ~${progress.daysTotal} days`,
    showHeartbeat: true,
    showProgress: true,
    state: "active",
  };
}

export function importRunningLine(progress: ImportProgress, now = new Date()) {
  const presentation = importStartupPresentation(progress, now);
  return [presentation.fact, presentation.activity].filter(Boolean).join(" · ");
}

// One presentation timezone for every timestamp in the strip: Pacific, the zone the provider
// buckets these days in.
export function freshnessNote(lastProbeAt: string | null) {
  if (!lastProbeAt) return FRESHNESS_UNKNOWN;
  return `Fresh data through ${formatPacificTimestampValue(new Date(lastProbeAt))} Pacific. Google may still adjust these numbers before they finalize.`;
}

/**
 * A truncated day is not a privacy filter: the provider stopped sending rows at its ceiling.
 * The coverage fact says so rather than letting the percentage carry both meanings.
 */
export function capHitClause(days: number) {
  if (days <= 0) return "";
  return `, and this property hit Google's row ceiling on ${days} ${days === 1 ? "day" : "days"}`;
}

export function incidentTooltip(incidents: readonly { label: string }[]) {
  return incidents.map((incident) => incident.label).join(" ");
}
