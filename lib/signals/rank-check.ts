import { comparableUrl } from "@/lib/alerts/url-mismatch";
import type { SerpDepth } from "@/lib/serp/markets";
import { SIGNAL_TYPES, type SignalInput } from "./types";

export type RankCheckSignalArgs = {
  checkedAt: Date;
  comparisonAllowed: boolean;
  keywordId: string;
  position: number | null;
  previousPosition: number | null;
  previousRankingUrl: string | null;
  projectId: string;
  rankCheckId: string;
  requestedDepth: SerpDepth;
  rankingUrl: string | null;
  targetUrl: string | null;
};

function rankingChangedSeverity(before: number | null, after: number | null) {
  if (before !== null && after === null) {
    return "warning";
  }
  if (before !== null && after !== null && after > before) {
    return "warning";
  }
  return "info";
}

function rankingUrlChangedSeverity(
  previousUrl: string | null,
  currentUrl: string | null,
  targetUrl: string | null,
) {
  const targetComparable = comparableUrl(targetUrl);
  if (!targetComparable) {
    return { matchesTargetUrl: null, severity: "info" as const };
  }

  const previousMatches = comparableUrl(previousUrl) === targetComparable;
  const currentMatches = comparableUrl(currentUrl) === targetComparable;
  return {
    matchesTargetUrl: currentMatches,
    severity: currentMatches || !previousMatches ? ("info" as const) : ("warning" as const),
  };
}

export function signalsForRankCheck(args: RankCheckSignalArgs): SignalInput[] {
  if (!args.comparisonAllowed) return [];
  const signals: SignalInput[] = [];

  if (args.previousPosition !== args.position) {
    signals.push({
      happenedAt: args.checkedAt,
      keywordId: args.keywordId,
      payload: {
        after: args.position,
        before: args.previousPosition,
        delta:
          args.previousPosition !== null && args.position !== null
            ? args.previousPosition - args.position
            : null,
        rankCheckId: args.rankCheckId,
        requestedDepth: args.requestedDepth,
      },
      projectId: args.projectId,
      severity: rankingChangedSeverity(args.previousPosition, args.position),
      source: "rank_tracker",
      type: SIGNAL_TYPES.rankingChanged,
      url: args.rankingUrl,
    });
  }

  const previousComparable = comparableUrl(args.previousRankingUrl);
  const currentComparable = comparableUrl(args.rankingUrl);
  if (
    args.previousRankingUrl !== null &&
    args.rankingUrl !== null &&
    previousComparable !== currentComparable
  ) {
    const { matchesTargetUrl, severity } = rankingUrlChangedSeverity(
      args.previousRankingUrl,
      args.rankingUrl,
      args.targetUrl,
    );
    signals.push({
      happenedAt: args.checkedAt,
      keywordId: args.keywordId,
      payload: {
        after: args.rankingUrl,
        before: args.previousRankingUrl,
        matchesTargetUrl,
        requestedDepth: args.requestedDepth,
      },
      projectId: args.projectId,
      severity,
      source: "rank_tracker",
      type: SIGNAL_TYPES.rankingUrlChanged,
      url: args.rankingUrl,
    });
  }

  return signals;
}
