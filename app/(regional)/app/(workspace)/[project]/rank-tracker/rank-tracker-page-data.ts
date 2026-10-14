import type { MarketGridGroupRow } from "@/lib/keywords/market-grid-model";
import type { NextSearchParams, RankTrackerQueryState } from "@/lib/keywords/rank-tracker-query";
import type {
  RankTrackerGroupedListResult,
  RankTrackerListResult,
} from "@/lib/keywords/rank-tracker-query-types";
import {
  rankTrackerScope,
  resolveRankTrackerReportTime,
} from "@/lib/keywords/rank-tracker-report-scope";
import { keywordViewLegacyScope } from "@/lib/keywords/saved-view-v2-model";
import { getRankTrackerGroupedList } from "@/lib/queries/rank-tracker-grouped-list";
import { getRankTrackerKeywordList } from "@/lib/queries/rank-tracker-list";
import { loadRankTrackerLocalList } from "@/lib/queries/rank-tracker-local-list";
import type { RankTrackerLocalPresentation } from "@/lib/queries/rank-tracker-local-model";
import { loadRankTrackerPersonalContext } from "@/lib/queries/rank-tracker-personal-context";
import type { RankTrackerReportOptions } from "@/lib/queries/rank-tracker-report-model";
import { createSessionRankTrackerReportOptions } from "@/lib/queries/rank-tracker-session-report";

export type RankTrackerPageList =
  | (RankTrackerListResult & {
      mode: "flat-server";
      query: RankTrackerQueryState;
      local?: RankTrackerLocalPresentation;
    })
  | (RankTrackerGroupedListResult & {
      groups: MarketGridGroupRow[];
      mode: "grouped-server";
      query: RankTrackerQueryState;
      local?: RankTrackerLocalPresentation;
    });

export async function resolveRankTrackerPageQuery(projectRef: string, params: NextSearchParams) {
  const context = await loadRankTrackerPersonalContext(projectRef, params);
  const activeView =
    context.activeView?.config.surface === "keywords"
      ? {
          ...context.activeView,
          surface: "keywords" as const,
          config: keywordViewLegacyScope(context.activeView.config),
        }
      : null;
  return {
    activeView,
    query: context.state,
    status: context.status,
    explicitGrouping: context.explicitGrouping,
    malformedDevice: false,
    staleView: context.status === "unavailable_view",
    personalPreferences: {
      privateCreation: context.privateCreation,
      views: context.views,
      preference: {
        ...context.preference,
        defaultTarget:
          context.notice === "unavailable_default" ? null : context.preference.defaultTarget,
        notice: context.notice ?? context.preference.notice,
      },
      presentation: context.presentation,
      scopeKey: context.scopeKey,
    },
  };
}

export async function loadRankTrackerPageList(
  projectRef: string,
  query: RankTrackerQueryState,
  projectMarkets: readonly { id: string; status: "active" | "paused" }[],
  options: { explicitGrouping?: boolean; report?: RankTrackerReportOptions } = {},
): Promise<RankTrackerPageList> {
  // The visible registry includes paused markets and excludes archived markets.
  const effectiveQuery = {
    ...query,
    grouped: options.explicitGrouping ? query.grouped : projectMarkets.length > 1,
  };
  const time = resolveRankTrackerReportTime(rankTrackerScope(effectiveQuery));
  const report =
    options.report ?? (await createSessionRankTrackerReportOptions(time.asOf, time.comparisonDays));
  if (rankTrackerScope(effectiveQuery).view === "local")
    return loadRankTrackerLocalList(projectRef, effectiveQuery, report);
  if (effectiveQuery.grouped) {
    const result = await getRankTrackerGroupedList({ projectRef, query: effectiveQuery }, report);
    return {
      ...result,
      mode: "grouped-server",
      query: { ...effectiveQuery, lens: result.resolvedLens },
    };
  }
  const flat = await getRankTrackerKeywordList({ projectRef, query: effectiveQuery }, report);
  return {
    ...flat,
    mode: "flat-server",
    query: { ...effectiveQuery, lens: flat.resolvedLens },
  };
}
