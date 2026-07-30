export type SampleRankCheckFrequency =
  | "paused"
  | "manual"
  | "daily"
  | "weekly"
  | "monthly"
  | "custom_cron";

export type AcmeKeywordFixture = {
  publicId: string;
  text: string;
  targetUrl?: string | null;
  tags?: readonly string[];
  positions?: readonly number[];
  frequency?: SampleRankCheckFrequency;
  nextCheckAt?: string;
};

export type SampleKeywordFixture = {
  key: string;
  intent: string;
  tags: readonly string[];
  targetUrl: string;
  text: string;
  topic: string;
};

export type SampleRankCheckFixture = {
  checkedAt: Date;
  key: string;
  keywordKey: string;
  position: number;
  previousPosition: number | null;
  rankingUrl: string;
};

type RankingPayload = { after: number; before: number; delta: number; rankCheckId: string };
type UrlPayload = { after: string; before: string; matchesTargetUrl: boolean | null };

export type SampleSignalFixture = {
  happenedAt: Date;
  key: string;
  keywordKey: string;
  payload: RankingPayload | UrlPayload;
  rankCheckKey: string;
  severity: "info" | "warning";
  type: "ranking.changed" | "ranking_url.changed";
  url: string;
};

export type SampleTrafficSnapshotFixture = {
  clicks: number;
  ctr: number;
  date: Date;
  impressions: number;
  keywordKey: string;
  position: number;
  windowDays: 28;
};
