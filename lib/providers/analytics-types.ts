export type AnalyticsTopQuery = {
  query: string;
  clicks?: number;
  impressions?: number;
};

export type QueryStatRow = {
  query: string;
  page?: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type AnalyticsMetricRange = {
  max?: number;
  min?: number;
};

export type AnalyticsQueryStatsInput = {
  clicks?: AnalyticsMetricRange;
  endDate: string;
  impressions?: AnalyticsMetricRange;
  limit?: number;
  pagePath?: { match: "contains" | "prefix"; value: string };
  position?: AnalyticsMetricRange;
  query?: string;
  startDate: string;
};

export type PageStatRow = {
  path: string;
  sessions: number;
  visitors?: number;
  engagementRate?: number;
  keyEvents?: number;
  bounceRate?: number;
  visitDurationSeconds?: number;
  scrollDepth?: number;
};
