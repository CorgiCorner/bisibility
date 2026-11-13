"use client";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { KeywordRow } from "@/lib/queries/keyword-row-types";
import type { RankTrackerAiOverviewPresentation } from "@/lib/queries/rank-tracker-ai-overview-model";
import type { RankTrackerLocalPresentation } from "@/lib/queries/rank-tracker-local-model";
import { useKeywordAiOverviewColumns } from "./KeywordAiOverviewColumns";
import { useKeywordLocalColumns } from "./KeywordLocalColumns";

export function useRankTrackerViewColumns(
  columns: readonly DataTableColumn<KeywordRow>[],
  local: RankTrackerLocalPresentation | undefined,
  aiOverview: RankTrackerAiOverviewPresentation | undefined,
) {
  const localColumns = useKeywordLocalColumns(columns, local?.facts ?? []);
  const aiColumns = useKeywordAiOverviewColumns(columns, aiOverview?.facts ?? []);
  if (local) return localColumns;
  if (aiOverview) return aiColumns;
  return columns;
}
