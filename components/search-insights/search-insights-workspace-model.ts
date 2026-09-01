import type {
  ExportSearchInsightsCsvAction,
  LoadSearchInsightsPropertiesAction,
  SelectSearchInsightsPropertyAction,
  SyncSearchInsightsNowAction,
} from "@/lib/actions/search-insights";
import { RETENTION_MONTHS, WINDOW_PRESETS, YEAR_OVER_YEAR } from "@/lib/search-insights/constants";
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
import { DOMAIN_TIP, PREFIX_TIP, SYNC_LABEL, SYNC_TITLES } from "./search-insights-copy";

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
  disabled: boolean;
  id: string;
  label: string;
  sub: string;
};

export type SyncOutcome = "cooldown" | "idle" | "started";

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

export function periodTriggerLabel(period: SearchInsightsPeriod) {
  return `${period.label} / ${period.sub}`;
}

function etaLabel(milliseconds: number) {
  const minutes = Math.ceil(Math.max(0, milliseconds) / 60_000);
  return minutes < 60 ? `${minutes} min` : `${Math.ceil(minutes / 60)} hr`;
}

function periodReadiness(facts: ImportObservabilityFacts, id: "7" | "28" | "90") {
  return facts.readyThrough[`d${id}`].current;
}

export function periodOptions(
  yoy: SearchInsightsContext["yoy"],
  facts?: ImportObservabilityFacts | null,
): PeriodOption[] {
  return [
    ...WINDOW_PRESETS.map((preset) => {
      const ready = facts ? periodReadiness(facts, preset.id) : true;
      const eta =
        facts && !ready
          ? etaLabel(Math.max(1, preset.days - facts.consecutiveDays) * facts.stall.expectedDayMs)
          : null;
      return {
        disabled: !ready,
        id: preset.id,
        label: preset.label,
        sub: ready ? preset.sub : `${preset.sub} / ready in ~${eta}`,
      };
    }),
    {
      disabled: true,
      id: YEAR_OVER_YEAR.id,
      label: YEAR_OVER_YEAR.label,
      sub: `${YEAR_OVER_YEAR.sub} / ${yoy.monthsImported} of ${RETENTION_MONTHS} imported`,
    },
  ];
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
          : SYNC_TITLES.backfill,
    };
  }
  if (outcome === "started" || outcome === "cooldown") {
    return { disabled: true, label: SYNC_LABEL, title: SYNC_TITLES.cooldown };
  }
  return { disabled: false, label: SYNC_LABEL, title: SYNC_TITLES.ready };
}

export function exportLabel(rows: number) {
  return `Export CSV (${rows.toLocaleString("en-US")} rows)`;
}
