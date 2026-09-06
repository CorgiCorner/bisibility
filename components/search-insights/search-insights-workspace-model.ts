import type {
  ExportSearchInsightsCsvAction,
  LoadSearchInsightsPropertiesAction,
  SelectSearchInsightsPropertyAction,
  SyncSearchInsightsNowAction,
} from "@/lib/actions/search-insights";
import type { DateFormat } from "@/lib/dates/format";
import {
  FIRST_LOOK_WINDOW,
  RETENTION_MONTHS,
  WINDOW_PRESETS,
  type WindowPresetId,
  YEAR_OVER_YEAR_COMPARISON,
} from "@/lib/search-insights/constants";
import {
  type FinalizedWindow,
  finalizedWindow,
  formatDateRangeLabel,
} from "@/lib/search-insights/dates";
import type {
  SearchInsightsContext,
  SearchInsightsImportState,
  SearchInsightsPeriod,
  SearchInsightsProperty,
} from "@/lib/search-insights/queries/context";
import type { ImportObservabilityFacts } from "@/lib/search-insights/queries/import-observability";
import type { SearchInsightsOauthReturn } from "@/lib/search-insights/queries/oauth-return";
import type { SearchSyncPace, SearchSyncRetentionMonths } from "@/lib/search-insights/sync/plan";
import type { ReactNode } from "react";
import type { SearchInsightsDrawerHostProps } from "./drawers/SearchInsightsDrawerHost";
import type {
  CancelGooglePropertySelectionAction,
  CompleteGooglePropertySelectionAction,
  DisconnectGoogleSearchConsoleAction,
} from "./SearchInsightsOauthReturn";
import {
  backfillSyncTitle,
  DOMAIN_TIP,
  PERIOD_MENU_LABEL,
  PERIOD_PACIFIC_TOOLTIP,
  PREFIX_TIP,
  SYNC_LABEL,
  SYNC_TITLES,
} from "./search-insights-copy";
import { etaLabel } from "./search-insights-trust-model";

export type SearchInsightsWorkspaceProps = {
  /** Module body: the streamed first view, or an empty state. */
  children?: ReactNode;
  cancelPropertySelectionAction: CancelGooglePropertySelectionAction;
  completePropertySelectionAction: CompleteGooglePropertySelectionAction;
  context: SearchInsightsContext;
  disconnectConnectionAction: DisconnectGoogleSearchConsoleAction;
  /** Everything the drawer stack and the Track dialog need, absent until a property is connected. */
  drawers?: Omit<SearchInsightsDrawerHostProps, "children">;
  exportAction: ExportSearchInsightsCsvAction;
  loadPropertiesAction: LoadSearchInsightsPropertiesAction;
  /** The resolved Google consent return: a property choice to finish, or a failure to explain. */
  oauth: SearchInsightsOauthReturn;
  projectId: string;
  projectDomain: string;
  selectPropertyAction: SelectSearchInsightsPropertyAction;
  syncAction: SyncSearchInsightsNowAction;
  syncPlan?: {
    daysTotal: number;
    pace: SearchSyncPace;
    retentionMonths: SearchSyncRetentionMonths;
  };
  /** Provenance strip, streamed beside the body. */
  trustStrip?: ReactNode;
};

export type PeriodOption = {
  dates: string | null;
  disabled: boolean;
  id: WindowPresetId;
  label: string;
  sub: string | null;
};

export type SyncOutcome = "cooldown" | "idle" | "queued";

export type YearOverYearOption = {
  checked: boolean;
  disabled: boolean;
  reason: string | null;
};

export type SyncView = {
  disabled: boolean;
  label: string;
  title: string;
};

const TRUNCATE_ABOVE = 16;
const TAIL_LENGTH = 12;

/**
 * The end of a property string carries the subdomain and path that tell two properties apart,
 * so the tail stays whole and the head is what gives way.
 */
export function propertyTruncation(name: string) {
  if (name.length <= TRUNCATE_ABOVE) return { head: name, tail: "" };
  return { head: name.slice(0, name.length - TAIL_LENGTH), tail: name.slice(-TAIL_LENGTH) };
}

export function propertyTip(kind: SearchInsightsProperty["kind"]) {
  return kind === "domain" ? DOMAIN_TIP : PREFIX_TIP;
}

export function periodTriggerLabel(
  period: SearchInsightsPeriod,
  window: FinalizedWindow | null = null,
  dateFormat: DateFormat = "month_first",
) {
  if (window) {
    const current = formatDateRangeLabel(window.current, dateFormat);
    if (period.id === FIRST_LOOK_WINDOW.id) return `First look · ${current}`;
    return current;
  }
  return period.id === FIRST_LOOK_WINDOW.id ? "First look" : period.label;
}

export function periodTriggerName(
  period: SearchInsightsPeriod,
  window: FinalizedWindow | null = null,
  dateFormat: DateFormat = "month_first",
) {
  if (!window) return PERIOD_MENU_LABEL;
  const current = formatDateRangeLabel(window.current, dateFormat);
  if (period.id === FIRST_LOOK_WINDOW.id) return `${PERIOD_MENU_LABEL}: First look, ${current}`;
  return `${PERIOD_MENU_LABEL}: ${current}`;
}

export function periodTooltipLines(
  period: SearchInsightsPeriod,
  window: FinalizedWindow,
  dateFormat: DateFormat = "month_first",
) {
  const lines = [`${formatDateRangeLabel(window.current, dateFormat)} · ${period.label}`];
  if (period.id !== FIRST_LOOK_WINDOW.id) {
    lines.push(`compared with ${formatDateRangeLabel(window.previous, dateFormat)}`);
  }
  lines.push(PERIOD_PACIFIC_TOOLTIP);
  return lines;
}

function periodReadiness(facts: ImportObservabilityFacts, id: "7" | "28" | "90") {
  return facts.readyThrough[`d${id}`].current;
}

export function periodOptions(
  facts: ImportObservabilityFacts | null = null,
  finalizedThrough: string | null = null,
  period: SearchInsightsPeriod | null = null,
  dateFormat: DateFormat = "month_first",
): PeriodOption[] {
  const datesFor = (days: number) => {
    if (!finalizedThrough) return null;
    const window = finalizedWindow(finalizedThrough, days);
    return formatDateRangeLabel(window.current, dateFormat);
  };
  const firstLook =
    period?.id === FIRST_LOOK_WINDOW.id
      ? [
          {
            dates: finalizedThrough
              ? formatDateRangeLabel(
                  finalizedWindow(finalizedThrough, FIRST_LOOK_WINDOW.days).current,
                  dateFormat,
                )
              : null,
            disabled: false,
            id: FIRST_LOOK_WINDOW.id,
            label: FIRST_LOOK_WINDOW.label,
            sub: null,
          },
        ]
      : [];
  return [
    ...firstLook,
    ...WINDOW_PRESETS.map((preset) => {
      const ready = facts ? periodReadiness(facts, preset.id) : true;
      const eta =
        facts && !ready
          ? etaLabel(Math.max(1, preset.days - facts.consecutiveDays) * facts.stall.expectedDayMs)
          : null;
      return {
        dates: datesFor(preset.days),
        disabled: !ready,
        id: preset.id,
        label: preset.label,
        sub: ready ? null : `ready in ~${eta}`,
      };
    }),
  ];
}

export function yearOverYearOption(
  period: SearchInsightsPeriod,
  yoy: SearchInsightsContext["yoy"],
  facts: ImportObservabilityFacts | null = null,
): YearOverYearOption {
  const disabled = yoy.monthsImported < yoy.required;
  const imported = facts?.deepHistoryMonths.completed ?? yoy.monthsImported;
  const target = facts?.deepHistoryMonths.target ?? RETENTION_MONTHS;
  return {
    checked: period.comparison === YEAR_OVER_YEAR_COMPARISON.mode,
    disabled,
    reason: disabled
      ? `Needs ${yoy.required} months of history · ${imported} of ${target} imported`
      : null,
  };
}

const BUSY_IMPORT_STATES = new Set(["paused", "queued", "running"]);

function pausedSyncTitle(reason: string | null) {
  if (reason === "user") return SYNC_TITLES.pausedUser;
  if (reason === "rate_limited") return SYNC_TITLES.pausedProvider;
  if (reason === "needs_reauth") return SYNC_TITLES.pausedReauth;
  return SYNC_TITLES.pausedRetry;
}

export function syncView(
  importState: SearchInsightsImportState | null,
  outcome: SyncOutcome,
  hasProperty = true,
): SyncView {
  if (!hasProperty) {
    return { disabled: true, label: SYNC_LABEL, title: SYNC_TITLES.requiresProperty };
  }
  if (importState && BUSY_IMPORT_STATES.has(importState.state)) {
    return {
      disabled: true,
      label: SYNC_LABEL,
      title:
        importState.state === "paused"
          ? pausedSyncTitle(importState.pausedReason)
          : backfillSyncTitle(importState.plannedRetentionMonths ?? RETENTION_MONTHS),
    };
  }
  if (outcome === "queued" || outcome === "cooldown") {
    return { disabled: true, label: SYNC_LABEL, title: SYNC_TITLES.cooldown };
  }
  return { disabled: false, label: SYNC_LABEL, title: SYNC_TITLES.ready };
}

export function exportLabel(rows: number) {
  return `Export CSV (${rows.toLocaleString("en-US")} rows)`;
}
