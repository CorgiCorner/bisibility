// Every string on the context bar, kept in one place so the module speaks with one voice.

import {
  DRAWER_LIST_CAP,
  SEARCH_INSIGHTS_EXPORT_ROW_CAP,
  SEARCH_INSIGHTS_ROWS_CAP,
} from "@/lib/search-insights/constants";

export const DOMAIN_TIP = "Covers the whole domain: every subdomain and protocol.";

export const PREFIX_TIP = "Covers only URLs starting with this exact address.";

export const PROPERTY_MENU_LABEL = "Search Console property";
export const PERIOD_MENU_LABEL = "Comparison window";

export const NO_PROPERTY_LABEL = "No property connected";
export const PROPERTIES_LOADING = "Loading properties...";
export const PROPERTIES_RECONNECT = "Reconnect the Google account to load its properties.";
export const PROPERTIES_FAILED = "Properties could not be loaded. Try again.";
export const PROPERTIES_EMPTY = "No properties on this account.";

export const SYNC_LABEL = "Sync now";

// A manual sync spends Google's load quota, so each disabled state says why rather than
// inviting a second click.
export const SYNC_TITLES = {
  backfill:
    "The 16-month import is still running. A manual sync queues behind it and would spend load quota twice.",
  cooldown:
    "Finalized days change once a day, so a second sync inside the cooldown would return the same rows.",
  pausedProvider:
    "The provider limit must reset before finalized data can be fetched. The import resumes automatically.",
  pausedReauth: "Reconnect Search Console before fetching new finalized data.",
  pausedRetry: "Retry the history import before fetching new finalized data.",
  pausedUser: "Resume the history import before fetching new finalized data.",
  ready: "Fetch anything Google has finalized since the last run.",
  requiresProperty: "Connect a Search Console property first.",
} as const;

export const SYNC_TOASTS = {
  already_running: "A sync is already running. The screen updates as it finishes.",
  no_connection: "Connect a Search Console property first, then run a sync.",
  unavailable: "Syncing is not available yet. Nothing already imported is affected.",
} as const;

export const EXPORT_FAILED = "The export could not be built. Try again.";
export const EXPORT_TRUNCATED = `The file carries the ${SEARCH_INSIGHTS_EXPORT_ROW_CAP.toLocaleString("en-US")} busiest queries of this window. Choose a shorter window for the rest.`;
export const SYNC_FAILED = "The sync could not be started. Try again.";
export const SELECT_FAILED = "The property could not be selected. Try again.";
export const REAUTH_REQUIRED = "Reconnect the Google account, then choose the property again.";

const IMPORT_RUNNING_PROGRESS =
  "The first 7-day view unlocks as soon as its finalized days are ready; older months keep loading in the background.";

// Every string that claims where the data lives, self-host first, cloud second. The guard limits
// ownership phrasing to the self-host branch, because a cloud workspace is not the customer's own
// database server.
export const OWNERSHIP_COPY = {
  importRunning: [
    `Google only keeps 16 months, so we are copying all of it into your database now. ${IMPORT_RUNNING_PROGRESS}`,
    `Google only keeps 16 months, so we are saving all of it to your workspace now. ${IMPORT_RUNNING_PROGRESS}`,
  ],
  retention: [
    "Kept in your database past Google's 16-month window",
    "Kept in your workspace past Google's 16-month window, yours to export any time",
  ],
} as const;

// Deployment-neutral strings, checked by the same guard.
export const NEUTRAL_COPY = {
  importDone: "16 months imported, growing daily",
  importPaused:
    "Waiting on provider quota or a token refresh. It retries on its own, and nothing already imported is affected. Only if it stalls for days does it become an action in Integrations.",
  storedRows: "Read from your stored daily rows. Opening this made no call to Google.",
} as const;

export function ownershipCopy(pair: readonly [string, string], mode: "cloud" | "self-host") {
  return mode === "cloud" ? pair[1] : pair[0];
}

export function importRunningOwnershipCopy(months: number, mode: "cloud" | "self-host") {
  if (months >= 16) return ownershipCopy(OWNERSHIP_COPY.importRunning, mode);
  const destination = mode === "cloud" ? "your workspace" : "your database";
  return `We are copying the planned ${months} months of Google history into ${destination} now. ${IMPORT_RUNNING_PROGRESS}`;
}

export function retentionOwnershipCopy(months: number, mode: "cloud" | "self-host") {
  if (months >= 16) return ownershipCopy(OWNERSHIP_COPY.retention, mode);
  return mode === "cloud"
    ? `Keeping the planned ${months} months in your workspace, yours to export any time`
    : `Keeping the planned ${months} months in your database`;
}

export function importDoneCopy(months: number) {
  return `${months} months imported, growing daily`;
}

export const TRUST_LABELS = {
  coverage: "Coverage",
  freshness: "Freshness",
  retention: "Retention",
} as const;

export const WAITING_FOR_FIRST_DATA =
  "Google has not reported any search data for this property yet. We check daily and will import automatically when it appears.";
export const FRESHNESS_UNKNOWN = "Waiting for the first data from Google.";
export const FRESHNESS_UNKNOWN_NOTE = "Finalized days appear here once the first sync lands.";
export const FRESHNESS_FINAL_PREFIX = "Final through";
export const FRESHNESS_CHECKED_PREFIX = "checked";
export const FRESHNESS_ADJUSTMENT_TOOLTIP = "Google may adjust recent data until it finalizes.";
export const COVERAGE_EMPTY = "Coverage appears once the first finalized days are imported.";
export const COVERAGE_NOTE =
  "Google hides low-volume query text for privacy, so the rest is real traffic with no query attached.";
export const IMPORT_PAUSED_LINE = "History import paused, resumes automatically";
export const IMPORT_WAITING_FOR_WORKER =
  "Import is waiting for the background worker - restart it and it resumes.";
export const IMPORT_WAITING_FOR_WORKER_TOOLTIP =
  "Imports run on the background worker (Temporal). If it is down, restart it and the import continues from where it stopped - nothing already imported is lost.";

const WORKER_IDENTITY_MISMATCH_COPY = {
  detail: [
    "Align the app and worker Temporal namespace and task queue, then restart the worker. Nothing already imported is lost.",
    "Background processing is reconnecting. The import will continue automatically, and nothing already imported is affected.",
  ],
  line: [
    "Import is waiting for the background worker configuration to match.",
    "Import is waiting for background processing to reconnect.",
  ],
} as const;

export function workerIdentityMismatchCopy(mode: "cloud" | "self-host", detail: string | null) {
  const line = ownershipCopy(WORKER_IDENTITY_MISMATCH_COPY.line, mode);
  return {
    detail: ownershipCopy(WORKER_IDENTITY_MISMATCH_COPY.detail, mode),
    line: mode === "self-host" && detail ? `${line} ${detail}` : line,
  };
}
export const INCIDENT_PILL = "Known Google data issue";

export const TABLE_TITLES = {
  pages: "Top pages",
  queries: "Top queries",
} as const;

export const TABLE_CAPTIONS = {
  pages: "Every page Google reported, named in full",
  queries: "Google's named queries only",
} as const;

export const SESSIONS_CONNECT_TITLE = "Organic sessions (GA4)";
export const SESSIONS_CONNECT_BODY =
  "Search Console stops at the click. Connect Analytics to see what happened after it, as a sessions column in Top pages. Second Google consent screen, read only, disconnect any time.";
export const SESSIONS_CONNECT_CTA = "Connect";
export const SESSIONS_JOIN_TIP =
  "Joined from GA4 by landing page. Search Console counts clicks and GA4 counts sessions, so the two never match exactly and a gap is normal.";
export const NO_SESSIONS_MATCH_TITLE = "No GA4 landing page matched this URL";
export const MANAGE_SESSIONS_LABEL = "Manage GA4";

export const AVG_POSITION_TIP =
  "Average position in Google's results over the selected window, weighted by impressions. Decimals because it is an average, not a single rank.";

export const COLLAPSE_LABEL = "Show top 10";
export const COLLAPSE_TITLE = "Back to the top 10 rows";
export const SHOW_MORE_LABEL = "Show more";
export const SHOW_MORE_TITLE =
  "All rows come from your stored data, so expanding costs nothing at the provider.";

/** Past a cap the control names the number it reaches, never a total it stops short of. */
export function showCapLabel(cap: number) {
  return `Show top ${cap.toLocaleString("en-US")}`;
}

export const SHOW_CAP_LABEL = showCapLabel(SEARCH_INSIGHTS_ROWS_CAP);
export const SHOW_CAP_TITLE = `This window holds more rows than one table can carry. The busiest ${SEARCH_INSIGHTS_ROWS_CAP.toLocaleString("en-US")} open here, and the export carries more.`;
export const ROWS_FAILED = "More rows could not be loaded. Try again.";

export const TRACK_LABEL = "Track";
export const TRACK_TITLE = "Add this query to Rank Tracker";
export const TRACKED_LABEL = "Tracked";
export const TRACKED_TITLE = "Already tracked in Rank Tracker";

export const TABLES_FOOTNOTE =
  "Coverage is the share of clicks and impressions whose query text Google names. The rest is real traffic on queries Google withholds, so the two tables never sum to the KPI row.";

export const SIGNAL_COPY = {
  bandSub: "Already earning impressions, none of them in the top three",
  overlapSub: "2 or more of your pages ranking for the same query",
  overlapTitle: "queries with page overlap",
} as const;

export const NO_PROPERTY_TITLE = "Connect Search Console";
export const NO_PROPERTY_BODY =
  "One read-only consent screen, then choose the property. We import what Google has finalized and keep it after Google drops it.";
export const NO_PROPERTY_CTA = "Connect Search Console";
export const REAUTH_TITLE = "Reconnect Search Console to keep reading this property";
export const REAUTH_BODY =
  "Google stopped accepting the stored authorization. Nothing already imported is affected; reconnecting resumes the import where it stopped.";
export const REAUTH_CTA = "Reconnect Search Console";

// Everything the drawer stack says. The four drawers read stored rows only, which is why the
// honesty line under the bars is NEUTRAL_COPY.storedRows rather than a freshness caveat.
export const DRAWER_COPY = {
  bandNote: "Every one of these already earns impressions, so the work is position, not demand.",
  bandPivotTitle: "Biggest demand first",
  bandSortTip:
    "Sorted by impressions: the more people already searching, the more a better position converts.",
  capTitle: `This list holds more rows than one panel can carry, so the busiest ${DRAWER_LIST_CAP.toLocaleString("en-US")} open here.`,
  clicksPerDay: "Clicks per day",
  failed: "This could not be opened. Try again.",
  loading: "Reading your stored rows",
  openPage: "Open page",
  overlapNote: "Google picks between your own pages here, and the pick can change between checks.",
  overlapPivotTitle: "Most clicks first",
  overlapSortTip: "Sorted by clicks on the query, highest first.",
  pageKicker: "Page",
  pagePivotTitle: "Queries landing here",
  queryKicker: "Query",
  queryOverlapNote:
    "More than one of your pages ranks here, so this query is also one of the overlaps counted above.",
  queryPagesTitle: "Your pages competing for it",
  queryPageTitle: "Your page ranking for it",
  retry: "Try again",
  sessions: "Organic sessions",
  track: "Track this query in Rank Tracker",
  tracked: "Tracked in Rank Tracker",
} as const;

export const DRAWER_STAT_LABELS = ["Clicks", "Impr", "CTR", "Avg pos"] as const;

export function overlapBadgeTitle(pages: number) {
  return `${pages} of your pages rank for this query. Full breakdown, with each page's position, is one click away.`;
}

export const TRACK_DIALOG_COPY = {
  adding: "Adding",
  cancel: "Cancel",
  costTitle: "What this costs",
  depth: "Search depth",
  device: "Device",
  market: "Market",
  ownRate:
    "Billed by your provider at your own rate, not by us. Nothing is spent until you confirm.",
  paused: "PAUSED",
  schedule: "Schedule",
  title: "Add to Rank Tracker",
} as const;

export const TRACK_FAILED = "The query could not be added to Rank Tracker. Try again.";
export function trackDoneCopy(frequency: string) {
  if (frequency === "manual") return "Added as manual in Rank Tracker.";
  if (frequency === "paused") return "Added paused in Rank Tracker.";
  return `Tracked ${frequency.replace("_", " ")} in Rank Tracker.`;
}
