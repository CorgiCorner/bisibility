export type AnalyticsTopQuery = {
  query: string;
  clicks?: number;
  impressions?: number;
};

export type QueryStatRow = {
  query: string;
  page?: string;
  country?: string;
  device?: string;
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
  country?: string;
  device?: "desktop" | "mobile" | "tablet";
  dimensions?: Array<"query" | "page" | "country" | "device">;
  endDate: string;
  impressions?: AnalyticsMetricRange;
  limit?: number;
  offset?: number;
  pagePath?: { match: "contains" | "prefix"; value: string };
  position?: AnalyticsMetricRange;
  query?: string;
  queryMatch?: "contains" | "equals";
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
