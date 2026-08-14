import { rankBucketColors } from "@/lib/theme/chart-colors";
import type {
  DataSourceHealth,
  DistributionBucket,
  HighlightList,
  HighlightRow,
  OverviewKpi,
  OverviewView,
  TrendPoint,
} from "./types";

type KeywordFixture = {
  id: number;
  keyword: string;
  position: number;
  previousPosition: number;
  url: string;
};

const keywords: KeywordFixture[] = [
  { id: 1, keyword: "headless cms", position: 3, previousPosition: 5, url: "/headless-cms" },
  {
    id: 2,
    keyword: "open source analytics",
    position: 1,
    previousPosition: 1,
    url: "/vs/google-analytics",
  },
  {
    id: 3,
    keyword: "react data grid",
    position: 6,
    previousPosition: 4,
    url: "/docs/data-grid",
  },
  {
    id: 4,
    keyword: "self hosted seo tool",
    position: 2,
    previousPosition: 7,
    url: "/self-host",
  },
  { id: 5, keyword: "keyword rank tracker", position: 4, previousPosition: 6, url: "/" },
  {
    id: 6,
    keyword: "google search console api",
    position: 8,
    previousPosition: 8,
    url: "/integrations/gsc",
  },
  {
    id: 7,
    keyword: "serp api alternative",
    position: 5,
    previousPosition: 9,
    url: "/vs/serpapi",
  },
  {
    id: 8,
    keyword: "docker seo dashboard",
    position: 11,
    previousPosition: 14,
    url: "/docs/docker",
  },
  {
    id: 9,
    keyword: "track keyword position",
    position: 7,
    previousPosition: 6,
    url: "/features/rank-tracking",
  },
  {
    id: 10,
    keyword: "nextauth alternative",
    position: 13,
    previousPosition: 12,
    url: "/docs/auth",
  },
  {
    id: 11,
    keyword: "share of voice tool",
    position: 9,
    previousPosition: 15,
    url: "/features/share-of-voice",
  },
  {
    id: 12,
    keyword: "competitor rank tracking",
    position: 4,
    previousPosition: 5,
    url: "/features/competitors",
  },
  {
    id: 13,
    keyword: "mui data grid export",
    position: 18,
    previousPosition: 22,
    url: "/docs/export",
  },
  {
    id: 14,
    keyword: "seo monitoring open source",
    position: 2,
    previousPosition: 3,
    url: "/",
  },
];

function keywordId(keyword: string) {
  return `kw_${keyword.replaceAll(/[^a-z0-9]+/g, "_").replaceAll(/^_|_$/g, "")}`;
}

function highlightRow(keyword: KeywordFixture, note: string): HighlightRow {
  const change = keyword.previousPosition - keyword.position;

  return {
    device: "desktop",
    id: keywordId(keyword.keyword),
    keyword: keyword.keyword,
    marketLabel: "United States / English",
    note,
    positionText: `#${keyword.position}`,
    delta:
      change === 0
        ? undefined
        : {
            direction: change > 0 ? "up" : "down",
            value: String(Math.abs(change)),
            title: change > 0 ? `Up ${Math.abs(change)}` : `Down ${Math.abs(change)}`,
          },
  };
}

const byGain = [...keywords].sort(
  (a, b) => b.previousPosition - b.position - (a.previousPosition - a.position),
);

const biggestWins = byGain
  .filter((keyword) => keyword.position < keyword.previousPosition)
  .slice(0, 4)
  .map((keyword) =>
    highlightRow(keyword, `Gained ${keyword.previousPosition - keyword.position} · ${keyword.url}`),
  );

const needsAttention = byGain
  .slice()
  .reverse()
  .filter((keyword) => keyword.position > keyword.previousPosition)
  .slice(0, 3)
  .map((keyword) =>
    highlightRow(
      keyword,
      `Dropped ${keyword.position - keyword.previousPosition} · ${keyword.url}`,
    ),
  );

needsAttention.push({
  device: "desktop",
  id: "kw_edge_function_logs",
  keyword: "edge function logs",
  marketLabel: "United States / English",
  note: "Provider check failed · retry",
  positionText: "No data",
  positionTone: "danger",
});

const newTop10 = keywords
  .filter((keyword) => keyword.position <= 10 && keyword.previousPosition > keyword.position)
  .sort((a, b) => a.position - b.position)
  .slice(0, 4)
  .map((keyword) => highlightRow(keyword, `On page one · ${keyword.url}`));

export const overviewFixture = {
  addedThisMonth: 12,
  byMarket: [],
  kpis: [
    { label: "Avg. position", value: "7.0", delta: "▼ 1.3", deltaTone: "positive" },
    { label: "Tracked keywords", value: "248", delta: "+12", deltaTone: "neutral" },
    { label: "In top 10", value: "119", delta: "+14", deltaTone: "positive" },
    { label: "Visibility", value: "34%", delta: "+2.4pp", deltaTone: "positive" },
  ] satisfies OverviewKpi[],
  trend: [
    { label: "W1", value: 11 },
    { label: "W2", value: 10 },
    { label: "W3", value: 10 },
    { label: "W4", value: 9 },
    { label: "W5", value: 9 },
    { label: "W6", value: 8 },
    { label: "W7", value: 8 },
    { label: "W8", value: 7 },
    { label: "W9", value: 7 },
    { label: "W10", value: 6 },
    { label: "W11", value: 6 },
    { label: "now", value: 5 },
  ] satisfies TrendPoint[],
  trendTakeaway: "Avg position improved 1.8 in the last 30 days, led by 'headless cms'",
  distribution: [
    { label: "#1-3", count: 41, color: rankBucketColors[0] },
    { label: "#4-10", count: 78, color: rankBucketColors[1] },
    { label: "#11-20", count: 64, color: rankBucketColors[2] },
    { label: "#21-50", count: 41, color: rankBucketColors[3] },
    { label: "#51-100", count: 24, color: rankBucketColors[4] },
  ] satisfies DistributionBucket[],
  dataSource: {
    status: "Provider healthy",
    description: "How rankings are collected for this project",
    note: "You pay DataForSEO per check and control the cadence.",
    metrics: [
      { label: "Provider", value: "DataForSEO" },
      { label: "Last check", value: "2h ago" },
      { label: "Next check", value: "in 22h" },
      { label: "Checks this month", value: "7,440" },
      { label: "Est. provider cost", value: "$4.46" },
    ],
  } satisfies DataSourceHealth,
  checksThisMonth: 7440,
  domain: "acme.dev",
  estimatedProviderCost: "$4.46",
  firstPendingKeywordId: null,
  gettingStarted: {
    gscOAuthConfigured: true,
    hasAnalyticsSource: true,
    hasCheck: true,
    hasKeywords: true,
    projectId: "prj_abc123",
    providerConnected: true,
  },
  hasEverChecked: true,
  isEmpty: false,
  lastCheckAt: new Date("2026-06-28T10:00:00.000Z"),
  lastCheckEverAt: new Date("2026-06-28T10:00:00.000Z"),
  nextCheckAt: new Date("2026-06-29T08:00:00.000Z"),
  providerConnected: true,
  projectReadOnly: false,
  publicId: "prj_abc123",
  serpProviderState: "ready",
  state: "populated",
  toolbar: {
    availableTags: ["Docs", "Product"],
    device: "All devices",
    deviceValue: "all",
    marketOptions: [
      { label: "Spain", secondary: "Spanish", value: "loc_es_es" },
      { label: "Belgium", secondary: "Dutch", value: "loc_be_nl" },
    ],
    marketValues: [],
    range: "Last 28 days",
    rangeValue: "28d",
    refresh: "Daily",
    tag: "All tags",
    tagValue: null,
  },
  trackedKeywordCount: 248,
  workspaceName: "Acme",
  highlights: [
    {
      kind: "wins",
      title: "Biggest wins",
      subtitle: "Gained the most positions",
      rows: biggestWins,
    },
    {
      kind: "attention",
      title: "Needs attention",
      subtitle: "Dropped, lost top 10, or failed checks",
      rows: needsAttention,
    },
    {
      kind: "newTop10",
      title: "New in top 10",
      subtitle: "Now ranking on page one",
      rows: newTop10,
    },
    {
      kind: "recentlyAdded",
      title: "Recently added",
      subtitle: "Waiting for first check",
      rows: [
        {
          id: "kw_vector_database_hosting",
          keyword: "vector database hosting",
          note: "Added 2h ago · first check pending",
          positionText: "No data",
          positionTone: "muted",
        },
        {
          id: "kw_llms_txt_generator",
          keyword: "llms.txt generator",
          note: "Added today · first check pending",
          positionText: "No data",
          positionTone: "muted",
        },
        {
          id: "kw_mcp_server_hosting",
          keyword: "mcp server hosting",
          note: "Added yesterday · first check pending",
          positionText: "No data",
          positionTone: "muted",
        },
      ],
    },
  ] satisfies HighlightList[],
} satisfies OverviewView;
