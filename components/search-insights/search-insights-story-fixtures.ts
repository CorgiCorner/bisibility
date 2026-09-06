import type {
  ExportSearchInsightsCsvAction,
  LoadSearchInsightsPropertiesAction,
  SelectSearchInsightsPropertyAction,
  SyncSearchInsightsNowAction,
} from "@/lib/actions/search-insights";
import type { LoadSearchInsightsRowsAction } from "@/lib/actions/search-insights-rows";
import type {
  SearchInsightsContext,
  SearchInsightsImportState,
} from "@/lib/search-insights/queries/context";
import type { SearchInsightsCoverage } from "@/lib/search-insights/queries/coverage";
import type { SearchInsightsFirstView } from "@/lib/search-insights/queries/first-view";
import { searchInsightsKpis } from "@/lib/search-insights/queries/kpis-model";
import type {
  SearchInsightsPageRow,
  SearchInsightsQueryRow,
} from "@/lib/search-insights/queries/top-rows-model";
import { isoFromFrozenNow } from "@/tests/clock";
import type { CompleteGooglePropertySelectionAction } from "./SearchInsightsOauthReturn";

export const storyProperties = [
  {
    displayName: "example.com",
    kind: "domain" as const,
    kindLabel: "domain",
    permissionLevel: "siteOwner",
    value: "sc-domain:example.com",
  },
  {
    displayName: "https://example.com/",
    kind: "url-prefix" as const,
    kindLabel: "url prefix",
    permissionLevel: "siteOwner",
    value: "https://example.com/",
  },
  {
    displayName: "https://blog.example.com/",
    kind: "url-prefix" as const,
    kindLabel: "url prefix",
    permissionLevel: "siteFullUser",
    value: "https://blog.example.com/",
  },
];

export const storyImportFacts = {
  consecutiveDays: 118,
  deepHistoryMonths: { completed: 3, target: 16 },
  lastActivityAt: isoFromFrozenNow({ hours: -7, minutes: -5 }),
  lastProbeAt: isoFromFrozenNow({ hours: -15, minutes: -40 }),
  qualifyingDays: 28,
  readyThrough: {
    d1: { current: true, previous: true },
    d7: { current: true, previous: true },
    d28: { current: true, previous: true },
    d90: { current: true, previous: false },
  },
  stall: {
    expectedBatchMs: 30 * 60_000,
    expectedDayMs: 4 * 60_000,
    nextRequestInMs: 0,
    silenceMs: 7 * 60 * 60_000,
    thresholdMs: 45 * 60_000,
  },
  targetDays: 28,
} as const;

export const storyImportState: SearchInsightsImportState = {
  facts: storyImportFacts,
  plannedRetentionMonths: 16,
  capHitDays: 0,
  cursorDate: "2026-03-14",
  daysDone: 118,
  daysTotal: 487,
  earliestTargetDate: "2025-03-14",
  finalizedThroughDate: "2026-07-08",
  lastProbeAt: isoFromFrozenNow({ hours: -15, minutes: -40 }),
  lastSyncStartedAt: isoFromFrozenNow({ hours: -17 }),
  newestFinalizedDate: "2026-07-08",
  pausedReason: null,
  state: "running",
};

export const storyContext: SearchInsightsContext = {
  connection: {
    property: {
      displayName: "example.com",
      kind: "domain",
      kindLabel: "domain",
      value: "sc-domain:example.com",
    },
    status: "connected",
  },
  counts: { queries: 1284 },
  importState: { ...storyImportState, state: "completed" },
  organicSessions: {
    importState: null,
    keyEventsConfigured: null,
    property: null,
    status: "not_connected",
  },
  projectDomain: "example.com",
  selectedProperty: {
    displayName: "example.com",
    kind: "domain",
    kindLabel: "domain",
    value: "sc-domain:example.com",
  },
  view: "active",
  period: {
    comparison: "previous_period",
    days: 28,
    id: "28",
    label: "28 finalized days",
  },
  window: {
    current: { end: "2026-07-08", start: "2026-06-11" },
    previous: { end: "2026-06-10", start: "2026-05-14" },
  },
  yoy: { monthsImported: 9, required: 13 },
};

export const storyExportAction = (async () => ({
  csv: "query,clicks,impressions,ctr,avg_position\nrank tracker,412,9120,0.0452,7.30",
  filename: "search-insights-queries-example-com-2026-06-11-2026-07-08.csv",
  rows: 1284,
  truncated: false,
})) as ExportSearchInsightsCsvAction;

export const storyLoadPropertiesAction = (async () => ({
  archived: [],
  properties: storyProperties,
})) as LoadSearchInsightsPropertiesAction;

export const storySelectPropertyAction = (async (input: unknown) => ({
  property: (input as { property: string }).property,
  status: "saved" as const,
})) as SelectSearchInsightsPropertyAction;

export const storySyncAction = (async () => ({
  status: "queued" as const,
})) as SyncSearchInsightsNowAction;

export const storyOauth = { error: null, provider: null, setup: null } as const;

export const storyCompletePropertySelectionAction = (async (input: unknown) => ({
  property: (input as { property: string }).property,
})) as CompleteGooglePropertySelectionAction;

const storyQueryTexts = [
  "open source rank tracker",
  "self hosted seo tools",
  "rank tracker api",
  "google rank tracker open source",
  "serp api pricing",
  "alternative rank tracking api",
  "seo data ownership",
  "keyword rank checker self hosted",
  "search console api rank tracking",
  "open source seo dashboard",
];

const storyPagePaths = [
  "/",
  "/blog/self-hosted-rank-tracking",
  "/docs/api/rank-checks",
  "/pricing",
  "/compare/rank-tracking-apis",
  "/blog/serp-cost-math",
  "/docs/self-host/docker",
  "/integrations/search-console",
  "/blog/16-month-window",
  "/changelog",
];

function storyMetrics(index: number) {
  const clicks = Math.max(12, Math.round(1284 * 0.78 ** index));
  const impressions = clicks * (18 + index * 3);
  return {
    clicks,
    ctr: clicks / impressions,
    impressions,
    position: 4.8 + index * 1.6,
  };
}

export const storyQueryRows: SearchInsightsQueryRow[] = storyQueryTexts.map((query, index) => ({
  ...storyMetrics(index),
  query,
}));

export const storyPageRows: SearchInsightsPageRow[] = storyPagePaths.map((path, index) => ({
  ...storyMetrics(index),
  engagementRate: null,
  keyEvents: null,
  path,
  sessions: null,
  url: `https://example.com${path}`,
}));

export const storyCoverage: SearchInsightsCoverage = {
  calculable: true,
  capHitDays: 0,
  clicksShare: 62,
  impressionsShare: 41,
};

export const storySignals = { bandCount: 34, overlapCount: 12 };

export const storyFirstView: SearchInsightsFirstView = {
  clicksToSessionsKpi: null,
  coverage: storyCoverage,
  deploymentMode: "self-host",
  incidents: [],
  kpis: searchInsightsKpis({
    current: { clicks: 12_480, ctr: 0.0257, impressions: 486_310, position: 18.4 },
    previous: { clicks: 11_534, ctr: 0.0244, impressions: 471_690, position: 20 },
  }),
  organicSessions: {
    importState: null,
    keyEventsConfigured: null,
    property: null,
    status: "not_connected",
  },
  pages: { rows: storyPageRows, total: 212 },
  queries: { rows: storyQueryRows, total: 1284 },
  sessionsKpi: null,
  sessionsReadable: false,
  trackedTexts: ["open source rank tracker", "google rank tracker open source"],
};

export const storyLoadRowsAction = (async () => ({
  kind: "queries" as const,
  rows: [],
  total: storyFirstView.queries.total,
  trackedTexts: [],
})) as LoadSearchInsightsRowsAction;
