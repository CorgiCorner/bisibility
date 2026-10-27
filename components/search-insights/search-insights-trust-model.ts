import type { DateFormat } from "@/lib/dates/format";
import { formatDateLabel, formatPacificTimestampValue } from "@/lib/search-insights/dates";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import { selectSearchImportCoverage } from "@/lib/search-insights/sync/control-model";
import {
  FRESHNESS_ADJUSTMENT_TOOLTIP,
  FRESHNESS_CHECKED_PREFIX,
  FRESHNESS_UNKNOWN,
  FRESHNESS_UNKNOWN_NOTE,
  WAITING_FOR_FIRST_DATA,
} from "./search-insights-copy";
import type { ImportProgress } from "./search-insights-import-progress";

export {
  type ImportProgress,
  type ImportProgressState,
  importProgress,
  progressWidthClass,
} from "./search-insights-import-progress";

export function relativeActivity(value: string, now = new Date()) {
  const minutes = Math.max(0, Math.floor((now.getTime() - Date.parse(value)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `${hours}h ago` : `${Math.floor(hours / 24)}d ago`;
}

export type ImportObservabilityProgress = {
  deepHistory: string;
  freshness: { label: string; tooltip: string };
  percent: number | null;
  qualifyingCounter: string;
};

function nonNegativeInteger(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

export function etaLabel(milliseconds: number) {
  const minutes = Math.ceil(Math.max(0, milliseconds) / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} hr`;
}

export function freshnessPresentation(
  lastProbeAt: string | null,
  now = new Date(),
  format: DateFormat = "month_first",
) {
  if (!lastProbeAt) return { label: FRESHNESS_UNKNOWN, tooltip: FRESHNESS_UNKNOWN_NOTE };
  const timestamp = formatPacificTimestampValue(new Date(lastProbeAt), format);
  return {
    label: `${FRESHNESS_CHECKED_PREFIX} ${relativeActivity(lastProbeAt, now)}`,
    tooltip: `Last checked ${timestamp} Pacific. ${FRESHNESS_ADJUSTMENT_TOOLTIP}`,
  };
}

/** The readiness selector, rather than an import cursor, owns every visible progress counter. */
export function importObservabilityProgress(
  facts: ImportObservabilityFacts | null | undefined,
  now = new Date(),
  format: DateFormat = "month_first",
): ImportObservabilityProgress | null {
  if (!facts) return null;
  const coverage = selectSearchImportCoverage({ observability: facts });
  const targetMonths = nonNegativeInteger(facts.deepHistoryMonths.target);
  const completedMonths = Math.min(
    targetMonths,
    nonNegativeInteger(facts.deepHistoryMonths.completed),
  );
  const qualifyingCounter =
    coverage.completed !== null && coverage.total !== null
      ? `${coverage.completed} of ${coverage.total} finalized days`
      : "Finalized import coverage is not available.";
  return {
    deepHistory: `${completedMonths} of ${targetMonths} months`,
    freshness: freshnessPresentation(facts.lastProbeAt, now, format),
    percent:
      coverage.completed !== null && coverage.total !== null && coverage.total > 0
        ? Math.round((coverage.completed / coverage.total) * 100)
        : null,
    qualifyingCounter,
  };
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
  format: DateFormat = "month_first",
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

  const active = progress.consecutiveDays > 0 || progress.lastActivityAt !== null;
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
    eta: null,
    fact:
      progress.firstDataDate && progress.earliestTargetDate && progress.newestFinalizedDate
        ? `Importing your Google history · ${formatDateLabel(
            progress.firstDataDate > progress.earliestTargetDate
              ? progress.firstDataDate
              : progress.earliestTargetDate,
            format,
          )} to ${formatDateLabel(progress.newestFinalizedDate, format)}`
        : `Importing your Google history · ${progress.consecutiveDays} of ~${progress.daysTotal} days`,
    showHeartbeat: true,
    showProgress: true,
    state: "active",
  };
}

export function importRunningLine(
  progress: ImportProgress,
  now = new Date(),
  format: DateFormat = "month_first",
) {
  const presentation = importStartupPresentation(progress, now, format);
  return [presentation.fact, presentation.activity].filter(Boolean).join(" · ");
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
