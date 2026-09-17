import { asProjectRef } from "@/lib/routing/app-path";
import { rankBucketColors } from "@/lib/theme/chart-colors";
import type { OverviewView } from "./types";

const projectRef = asProjectRef("prj_abc123");
const now = "2026-06-28T12:00:00.000Z";

export const overviewFixture = {
  addedThisMonth: 12,
  byMarket: [],
  checksThisMonth: 7440,
  dataSource: {
    checksThisMonth: 7440,
    lastCheckAt: "2026-06-28T10:00:00.000Z",
    lastCheckProvider: "serpapi",
    nextCheckAt: "2026-06-29T08:00:00.000Z",
    now,
    primaryProvider: "dataforseo",
    providerCostCents: 446,
    status: "healthy",
  },
  distribution: [
    { label: "#1-3", count: 41, color: rankBucketColors[0] },
    { label: "#4-10", count: 78, color: rankBucketColors[1] },
    { label: "#11-20", count: 64, color: rankBucketColors[2] },
    { label: "#21-50", count: 41, color: rankBucketColors[3] },
    { label: "#51-100", count: 24, color: rankBucketColors[4] },
  ],
  domain: "acme.dev",
  estimatedProviderCostCents: 446,
  firstPendingKeywordId: null,
  gettingStarted: {
    gscOAuthConfigured: true,
    hasAnalyticsSource: true,
    hasCheck: true,
    hasKeywords: true,
    projectId: "prj_abc123",
    projectRef,
    providerConnected: true,
  },
  hasEverChecked: true,
  highlights: [
    {
      kind: "wins",
      rows: [
        {
          delta: { direction: "up", value: 2 },
          device: "desktop",
          id: "kw_headless_cms",
          keyword: "headless cms",
          marketLanguageLabel: "English",
          marketLocationLabel: "United States",
          note: { direction: "gained", kind: "movement", url: "/headless-cms", value: 2 },
          position: 3,
          positionState: "ranked",
          positionTone: "default",
        },
      ],
    },
    {
      kind: "attention",
      rows: [
        {
          device: "desktop",
          id: "kw_failed",
          keyword: "failed keyword",
          marketLanguageLabel: "English",
          marketLocationLabel: "United States",
          note: { kind: "latestCheckFailed" },
          position: null,
          positionState: "noData",
          positionTone: "danger",
        },
      ],
    },
    {
      kind: "newTop10",
      rows: [
        {
          device: "desktop",
          id: "kw_top10",
          keyword: "open source analytics",
          marketLanguageLabel: "English",
          marketLocationLabel: "United States",
          note: { kind: "enteredTop10", url: "/analytics" },
          position: 9,
          positionState: "ranked",
          positionTone: "default",
        },
      ],
    },
    {
      kind: "recentlyAdded",
      rows: [
        {
          id: "kw_vector_database_hosting",
          keyword: "vector database hosting",
          note: {
            age: { kind: "hours", value: 2 },
            checkState: "firstCheckPending",
            kind: "recentlyAdded",
            url: null,
          },
          position: null,
          positionState: "awaitingFirstCheck",
          positionTone: "muted",
        },
      ],
    },
  ],
  isEmpty: false,
  kpis: [
    {
      delta: { kind: "averageComparison", value: 1.3 },
      deltaTone: "positive",
      id: "averagePosition",
      value: 7,
    },
    {
      delta: { kind: "countThisMonth", value: 12 },
      deltaTone: "neutral",
      id: "trackedKeywords",
      value: 248,
    },
    {
      delta: { kind: "countChange", value: 14 },
      deltaTone: "positive",
      id: "inTop10",
      value: 119,
    },
    {
      delta: { kind: "percentagePointChange", value: 2.4 },
      deltaTone: "positive",
      id: "visibility",
      value: 34,
    },
  ],
  lastCheckAt: new Date("2026-06-28T10:00:00.000Z"),
  lastCheckEverAt: new Date("2026-06-28T10:00:00.000Z"),
  nextCheckAt: new Date("2026-06-29T08:00:00.000Z"),
  projectReadOnly: false,
  providerConnected: true,
  publicId: projectRef,
  serpProviderState: "ready",
  state: "populated",
  toolbar: {
    availableTags: ["Docs", "Product"],
    deviceValue: "all",
    marketOptions: [
      { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
      { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
    ],
    marketValues: [],
    rangeValue: "28d",
    tagValue: null,
  },
  trackedKeywordCount: 248,
  trend: [
    { dateKey: "2026-06-18", label: "2026-06-18", value: 8 },
    { dateKey: "2026-06-28", label: null, value: 7 },
  ],
  trendTakeaway: {
    days: 30,
    kind: "improved",
    leader: "headless cms",
    value: 1.8,
    window: "lastThirtyDays",
  },
  visibilityCoverage: { limited: false, measured: 248, total: 248 },
  workspaceName: "Acme",
} satisfies OverviewView;
