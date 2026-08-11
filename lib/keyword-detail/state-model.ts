import { dailyPositionPoints } from "@/lib/keywords/position-history";
import type { KeywordTrafficDetail } from "@/lib/queries/keyword-traffic";
import type { KeywordRow } from "@/lib/queries/keywords";

export type KeywordDetailRankState =
  | "normal"
  | "never_checked"
  | "not_ranked"
  | "failed"
  | "running";
export type KeywordDetailChartState = "normal" | "one_check";
export type KeywordDetailWhatChanged = "diff" | "no_change" | "first_check";
export type KeywordDetailKeywordContext = "full" | "partial" | "unavailable";
export type KeywordDetailTrafficState = "both" | "gsc_only" | "awaiting_sync" | "not_connected";

export type KeywordDetailChangeDimensions = {
  hasMultipleChecks: boolean;
  position: { current: number; previous: number } | null;
  positionChanged: boolean;
  positionTransition: { current: number | null; previous: number | null } | null;
  rankingUrlChanged: boolean;
};

export type KeywordDetailPositionChange = {
  direction: "dropped" | "entered" | "improved" | "left";
  text: string;
};

export type KeywordDetailState = {
  chartState: KeywordDetailChartState;
  keywordContext: KeywordDetailKeywordContext;
  rankState: KeywordDetailRankState;
  trafficState: KeywordDetailTrafficState;
  whatChanged: KeywordDetailWhatChanged;
};

function rankState(keyword: KeywordRow): KeywordDetailRankState {
  if (keyword.hasRankData && keyword.checkState === "ranked") return "normal";
  if (keyword.checkState === "failed") return "failed";
  if (keyword.checkState === "running") return "running";
  if (keyword.checkState === "not_ranked") return "not_ranked";
  return "never_checked";
}

function keywordContext(keyword: KeywordRow): KeywordDetailKeywordContext {
  const known = [
    keyword.volumeKnown !== false,
    keyword.cpcKnown !== false,
    keyword.difficultyKnown !== false,
  ];
  if (known.every(Boolean)) return "full";
  if (known.some(Boolean)) return "partial";
  return "unavailable";
}

export function deriveKeywordDetailChangeDimensions(
  keyword: KeywordRow,
): KeywordDetailChangeDimensions {
  const comparableChecks = keyword.completedComparableChecks;
  const checks = comparableChecks ?? keyword.positionHistory ?? [];
  const latest = checks.at(-1);
  const previous = checks.at(-2);
  const latestComparable = comparableChecks?.at(-1);
  const previousComparable = comparableChecks?.at(-2);
  const positionTransition =
    latest !== undefined && previous !== undefined
      ? { current: latest.position, previous: previous.position }
      : null;
  const positionChanged =
    positionTransition !== null && positionTransition.current !== positionTransition.previous;
  const position =
    positionTransition !== null &&
    positionTransition.current !== null &&
    positionTransition.previous !== null
      ? { current: positionTransition.current, previous: positionTransition.previous }
      : null;
  const rankingUrlChanged =
    latestComparable !== undefined && previousComparable !== undefined
      ? latestComparable.rankingUrl !== previousComparable.rankingUrl
      : false;

  return {
    hasMultipleChecks: checks.length >= 2,
    position,
    positionChanged,
    positionTransition,
    rankingUrlChanged,
  };
}

export function describeKeywordDetailPositionChange(
  dimensions: KeywordDetailChangeDimensions,
): KeywordDetailPositionChange | null {
  const transition = dimensions.positionTransition;
  if (!transition || !dimensions.positionChanged) return null;
  if (transition.previous === null && transition.current !== null) {
    return {
      direction: "entered",
      text: `Position entered tracked results at #${transition.current}`,
    };
  }
  if (transition.previous !== null && transition.current === null) {
    return { direction: "left", text: "Position left tracked results" };
  }
  if (transition.previous === null || transition.current === null) return null;
  const delta = transition.previous - transition.current;
  if (delta === 0) return null;
  return {
    direction: delta > 0 ? "improved" : "dropped",
    text: `Position ${delta > 0 ? "improved" : "dropped"} #${transition.previous} → #${transition.current}`,
  };
}

export function deriveKeywordDetailWhatChanged(keyword: KeywordRow): KeywordDetailWhatChanged {
  const dimensions = deriveKeywordDetailChangeDimensions(keyword);
  if (!dimensions.hasMultipleChecks) return "first_check";
  return dimensions.positionChanged || dimensions.rankingUrlChanged ? "diff" : "no_change";
}

function trafficState(traffic: KeywordTrafficDetail): KeywordDetailTrafficState {
  if (traffic.query && traffic.pages.length > 0) return "both";
  if (traffic.query) return "gsc_only";
  return traffic.hasSearchConsoleConnection ? "awaiting_sync" : "not_connected";
}

export function deriveKeywordDetailState(
  keyword: KeywordRow,
  traffic: KeywordTrafficDetail,
): KeywordDetailState {
  const currentRankState = rankState(keyword);

  return {
    chartState:
      currentRankState === "normal" &&
      dailyPositionPoints(keyword.positionHistory ?? [], 90).length < 2
        ? "one_check"
        : "normal",
    keywordContext: keywordContext(keyword),
    rankState: currentRankState,
    trafficState: trafficState(traffic),
    whatChanged: deriveKeywordDetailWhatChanged(keyword),
  };
}
