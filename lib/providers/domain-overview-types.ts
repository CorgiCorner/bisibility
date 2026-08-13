import type { SerpRankLocation } from "@/lib/serp/location";

export type DomainRankMetrics = {
  count: number | null;
  estimatedTrafficCostCents: number | null;
  etv: number | null;
  isDown: number;
  isLost: number;
  isNew: number;
  isUp: number;
  pos1: number;
  pos11_20: number;
  pos21_30: number;
  pos2_3: number;
  pos31_40: number;
  pos41_50: number;
  pos4_10: number;
  pos51_60: number;
  pos61_70: number;
  pos71_80: number;
  pos81_90: number;
  pos91_100: number;
};

export type DomainOverviewResult = {
  costCents: number;
  metrics: DomainRankMetrics | null;
  sourceSnapshotAt: string | null;
};

export type HistoricalOverviewRow = { metrics: DomainRankMetrics; month: number; year: number };
export type HistoricalOverviewResult = { costCents: number; rows: HistoricalOverviewRow[] };

export type RelevantPageRow = {
  etv: number | null;
  etvDeltaPct: number | null;
  keywordCount: number | null;
  path: string;
  topKeyword: string | null;
  topKeywordPosition: number | null;
};

export type RelevantPagesResult = {
  /** Raw provider items consumed by this offset page, before malformed rows are dropped. */
  consumedCount: number;
  costCents: number;
  rows: RelevantPageRow[];
  totalCount: number;
};

export type DomainOverviewInput = {
  includeSubdomains: boolean;
  languageCode?: string;
  location: SerpRankLocation;
  locationCode?: number;
  target: string;
};

export type HistoricalRankOverviewInput = DomainOverviewInput & {
  dateFrom?: string;
  dateTo?: string;
};

export type RelevantPagesInput = DomainOverviewInput & {
  limit: number;
  offset: number;
};
