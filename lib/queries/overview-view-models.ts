export type Tone = "positive" | "negative" | "neutral";
export type OverviewKpiId = "averagePosition" | "inTop10" | "trackedKeywords" | "visibility";
export type OverviewKpiDelta =
  | {
      kind:
        | "awaitingFirstCheck"
        | "firstCheckFailed"
        | "new"
        | "noNewThisMonth"
        | "noRankedPositions"
        | "awaitingTop20";
    }
  | { kind: "averageComparison"; value: number }
  | { kind: "countThisMonth"; value: number }
  | { kind: "countChange"; value: number }
  | { kind: "percentagePointChange"; value: number };
export type Kpi = {
  delta: OverviewKpiDelta;
  deltaAction?: "check_runs";
  deltaTone: Tone;
  id: OverviewKpiId;
  value: number | null;
};
export type Bucket = { color: string; count: number; label: string };
export type MetricDistributionBucket = { count: number | null; max: number; min: number };
export type OverviewMetrics = {
  averagePosition: number | null;
  averagePositionDelta: number | null;
  positionDistribution: MetricDistributionBucket[];
  top3Count: number | null;
  top10Count: number | null;
  top10Delta: number | null;
  top100Count: number | null;
  visibility: number | null;
  visibilityMeasuredKeywordCount: number;
  visibilityDelta: number | null;
};
export type RelativeTime =
  | { kind: "justNow" | "yesterday" }
  | { kind: "minutes" | "hours" | "days"; value: number };
export type HighlightPositionState = "awaitingFirstCheck" | "noData" | "notRanked" | "ranked";
export type HighlightNote =
  | { kind: "rankingUrl"; url: string | null }
  | { kind: "movement"; direction: "dropped" | "gained"; value: number; url: string | null }
  | { kind: "latestCheckFailed" }
  | { kind: "latestCheckNotRanked" }
  | { kind: "enteredTop10"; url: string | null }
  | {
      age: RelativeTime;
      checkState: "firstCheckPending" | "notRanked" | "rankingUrl";
      kind: "recentlyAdded";
      url: string | null;
    };
export type HighlightRow = {
  delta?: { direction: "down" | "up"; value: number };
  device?: string;
  id: string;
  keyword: string;
  marketCountryCode?: string | null;
  marketLanguageCode?: string | null;
  marketLanguageLabel?: string;
  marketLocationLabel?: string;
  note: HighlightNote;
  position: number | null;
  positionState: HighlightPositionState;
  positionTone?: "danger" | "default" | "muted";
};
export type HighlightList = {
  kind: "attention" | "newTop10" | "recentlyAdded" | "wins";
  rows: HighlightRow[];
};
