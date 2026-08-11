import { buildPositionHistory } from "@/components/keywords/keyword-history-fixtures";
import { buildUrlHistory } from "@/components/keywords/keywords-fixture-url-history";
import {
  fixtureLocation,
  type KeywordLocation,
} from "@/components/keywords/keywords-fixtures-locations";
import type { RankingUrlEvent } from "@/lib/queries/keyword-row-types";

export type { KeywordLocation, RankingUrlEvent };
export type RankCheckFrequency =
  | "paused"
  | "manual"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom_cron";
export type LastCheckStatus = "completed" | "failed" | "running" | null;
export type KeywordCheckState = "failed" | "never_checked" | "not_ranked" | "ranked" | "running";

export type KeywordSchedule = {
  frequency: RankCheckFrequency;
  cron_expression: string | null;
  timezone: string;
  jitter_minutes: number;
  last_checked_at: string | null;
  next_check_at: string | null;
};
export type PositionPoint = { checkedAt: string; label: string; position: number };
type RawKeyword = {
  idNumber: number;
  keyword: string;
  position: number;
  previousPosition: number;
  bestPosition: number;
  volume: number;
  traffic: number;
  rankingPath: string;
  tags: string[];
  serpFeatures: string[];
  sparkline: number[];
};
export type KeywordRow = RawKeyword & {
  clicks: number | null;
  id: string;
  createdAt: string;
  ctr: number | null;
  checkState: KeywordCheckState;
  hasRankData: boolean;
  impressions: number | null;
  lastCheckAt: string | null;
  lastCheckStatus: LastCheckStatus;
  rankingUrl: string;
  location: KeywordLocation;
  locationName: string;
  device: string;
  engine: string;
  cpc: string;
  difficulty: number;
  rankingPages: number;
  schedule: KeywordSchedule;
  positionBaseline: number | null;
  positionHistoryBoundaryAt: string | null;
  positionHistory: PositionPoint[];
  rankingUrlHistory: RankingUrlEvent[];
  targetPosition: number | null;
  targetUrl: string | null;
  topic: string | null;
  trafficDate?: string;
  intent: string | null;
};
const rawKeywords = [
  {
    idNumber: 1,
    keyword: "headless cms",
    position: 3,
    previousPosition: 5,
    bestPosition: 2,
    volume: 18100,
    traffic: 12.4,
    rankingPath: "/headless-cms",
    tags: ["Product", "High intent"],
    serpFeatures: ["snippet", "sitelinks"],
    sparkline: [8, 7, 7, 6, 6, 5, 5, 4, 4, 3, 3, 3],
  },
  {
    idNumber: 2,
    keyword: "open source analytics",
    position: 1,
    previousPosition: 1,
    bestPosition: 1,
    volume: 9900,
    traffic: 18.1,
    rankingPath: "/vs/google-analytics",
    tags: ["Comparison"],
    serpFeatures: ["sitelinks", "people"],
    sparkline: [2, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1],
  },
  {
    idNumber: 3,
    keyword: "react data grid",
    position: 6,
    previousPosition: 4,
    bestPosition: 3,
    volume: 6600,
    traffic: 4.2,
    rankingPath: "/docs/data-grid",
    tags: ["Docs"],
    serpFeatures: ["snippet"],
    sparkline: [5, 5, 4, 4, 4, 5, 5, 6, 6, 5, 6, 6],
  },
  {
    idNumber: 4,
    keyword: "self hosted seo tool",
    position: 2,
    previousPosition: 7,
    bestPosition: 2,
    volume: 2400,
    traffic: 9.6,
    rankingPath: "/self-host",
    tags: ["Product", "High intent"],
    serpFeatures: ["sitelinks"],
    sparkline: [9, 8, 8, 7, 6, 5, 5, 4, 3, 3, 2, 2],
  },
  {
    idNumber: 5,
    keyword: "keyword rank tracker",
    position: 4,
    previousPosition: 6,
    bestPosition: 3,
    volume: 14800,
    traffic: 7.8,
    rankingPath: "/",
    tags: ["Product"],
    serpFeatures: ["snippet", "images"],
    sparkline: [7, 7, 6, 6, 6, 5, 5, 5, 4, 4, 4, 4],
  },
  {
    idNumber: 6,
    keyword: "google search console api",
    position: 8,
    previousPosition: 8,
    bestPosition: 6,
    volume: 3600,
    traffic: 2.1,
    rankingPath: "/integrations/gsc",
    tags: ["Docs", "Integration"],
    serpFeatures: ["snippet"],
    sparkline: [9, 9, 8, 8, 8, 7, 8, 8, 8, 8, 8, 8],
  },
  {
    idNumber: 7,
    keyword: "serp api alternative",
    position: 5,
    previousPosition: 9,
    bestPosition: 4,
    volume: 1900,
    traffic: 3.4,
    rankingPath: "/vs/serpapi",
    tags: ["Comparison"],
    serpFeatures: ["sitelinks"],
    sparkline: [12, 11, 10, 9, 8, 7, 7, 6, 5, 5, 5, 5],
  },
  {
    idNumber: 8,
    keyword: "docker seo dashboard",
    position: 11,
    previousPosition: 14,
    bestPosition: 9,
    volume: 880,
    traffic: 1.2,
    rankingPath: "/docs/docker",
    tags: ["Docs"],
    serpFeatures: [],
    sparkline: [18, 17, 16, 15, 14, 14, 13, 12, 12, 11, 11, 11],
  },
  {
    idNumber: 9,
    keyword: "track keyword position",
    position: 7,
    previousPosition: 6,
    bestPosition: 5,
    volume: 5400,
    traffic: 3.9,
    rankingPath: "/features/rank-tracking",
    tags: ["Product"],
    serpFeatures: ["snippet", "images"],
    sparkline: [9, 8, 8, 7, 7, 6, 7, 7, 7, 7, 7, 7],
  },
  {
    idNumber: 10,
    keyword: "nextauth alternative",
    position: 13,
    previousPosition: 12,
    bestPosition: 10,
    volume: 1300,
    traffic: 0.8,
    rankingPath: "/docs/auth",
    tags: ["Docs"],
    serpFeatures: [],
    sparkline: [15, 14, 14, 13, 13, 12, 13, 13, 13, 13, 13, 13],
  },
  {
    idNumber: 11,
    keyword: "share of voice tool",
    position: 9,
    previousPosition: 15,
    bestPosition: 8,
    volume: 720,
    traffic: 1.0,
    rankingPath: "/features/share-of-voice",
    tags: ["Product"],
    serpFeatures: ["snippet"],
    sparkline: [20, 19, 18, 16, 15, 13, 12, 11, 10, 9, 9, 9],
  },
  {
    idNumber: 12,
    keyword: "competitor rank tracking",
    position: 4,
    previousPosition: 5,
    bestPosition: 4,
    volume: 2900,
    traffic: 5.1,
    rankingPath: "/features/competitors",
    tags: ["Product", "High intent"],
    serpFeatures: ["sitelinks", "people"],
    sparkline: [8, 7, 7, 6, 6, 5, 5, 5, 4, 4, 4, 4],
  },
] satisfies RawKeyword[];

function shortKeywordId(idNumber: number) {
  return `kw_${((idNumber * 2654435761) >>> 0).toString(36).padStart(7, "0").slice(0, 7)}`;
}

function buildSchedule(idNumber: number): KeywordSchedule {
  const weekly = idNumber % 5 === 0;
  return {
    frequency: weekly ? "weekly" : "daily",
    cron_expression: null,
    timezone: "Europe/Warsaw",
    jitter_minutes: 60,
    last_checked_at: "2026-06-18T08:42:00.000Z",
    next_check_at: weekly ? "2026-06-25T08:00:00.000Z" : "2026-06-19T08:00:00.000Z",
  };
}

// biome-ignore format: compact fixture states keep this file under the line cap.
const freshnessById = new Map<number, { at: string | null; hasRankData?: boolean; status: LastCheckStatus }>([
  [1, { at: "2026-07-03T09:00:00.000Z", status: "completed" }],
  [2, { at: "2026-07-03T11:45:00.000Z", status: "running" }],
  [3, { at: "2026-07-03T07:30:00.000Z", status: "failed" }],
  [4, { at: null, hasRankData: false, status: null }],
  [5, { at: "2026-06-25T12:00:00.000Z", status: "completed" }],
]);

function decorateKeyword(row: RawKeyword): KeywordRow {
  const location = fixtureLocation(row.idNumber);
  const freshness = freshnessById.get(row.idNumber);
  return {
    ...row,
    clicks: Math.round(row.volume * (row.traffic / 100)),
    id: shortKeywordId(row.idNumber),
    createdAt: "2026-06-12T08:00:00.000Z",
    ctr: row.traffic / 100,
    checkState:
      freshness?.status === "running"
        ? "running"
        : freshness?.status === "failed"
          ? "failed"
          : freshness?.hasRankData === false
            ? "never_checked"
            : "ranked",
    hasRankData: freshness?.hasRankData ?? true,
    impressions: Math.round(row.volume * 0.42),
    lastCheckAt: freshness?.at ?? "2026-07-03T10:00:00.000Z",
    lastCheckStatus: freshness?.status ?? "completed",
    rankingUrl: `https://acme.dev${row.rankingPath}`,
    targetPosition: row.idNumber === 3 ? 3 : null,
    targetUrl: `https://acme.dev${row.rankingPath}`,
    topic: row.tags[0] ?? null,
    trafficDate: "2026-07-03T00:00:00.000Z",
    intent: row.tags.includes("High intent") ? "High intent" : null,
    location,
    locationName: location.displayName,
    device: "Desktop",
    engine: "Google",
    cpc: (0.6 + ((row.idNumber * 13) % 40) / 10).toFixed(2),
    difficulty: 25 + ((row.idNumber * 37) % 60),
    rankingPages: row.idNumber % 4 === 0 ? 2 : 1,
    schedule: buildSchedule(row.idNumber),
    positionBaseline: row.sparkline.at(-2) ?? null,
    positionHistoryBoundaryAt: null,
    positionHistory: buildPositionHistory(row.sparkline),
    rankingUrlHistory: buildUrlHistory(row),
  };
}

export const keywordRows = rawKeywords.map(decorateKeyword);
export function getKeywordById(id: string) {
  return keywordRows.find((keyword) => keyword.id === id || String(keyword.idNumber) === id);
}
