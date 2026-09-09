"use client";

import { CheckDepthSplitButton } from "@/components/keywords/CheckDepthSplitButton";
import { ProjectReadOnlyTooltip } from "@/components/shell/ProjectWriteModeNotices";
import { type MarketScope, scopedRunActionLabel } from "@/lib/markets/market-scope";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { SerpDepth } from "@/lib/serp/constants";
import { effectiveRowDepth, selectionDepthLabel } from "./run-check-depth";

type RunChecksSplitButtonProps = {
  checksRunning: boolean;
  chosenDepth: SerpDepth | null;
  /** Names the market this spend lands in. `null` is the project level and reads as before. */
  marketScope?: MarketScope | null;
  onDepthChange: (depth: SerpDepth) => void;
  onRunChecks: (keywordIds: string[], depth?: SerpDepth) => void;
  readOnly: boolean;
  selectedRows: KeywordRow[];
};

export function RunChecksSplitButton({
  checksRunning,
  chosenDepth,
  marketScope = null,
  onDepthChange,
  onRunChecks,
  readOnly,
  selectedRows,
}: Readonly<RunChecksSplitButtonProps>) {
  const selectedIds = selectedRows.map((row) => row.id);
  const selectionDepths = new Set(selectedRows.map(effectiveRowDepth));
  const uniformDepth = selectionDepths.size === 1 ? selectionDepths.values().next().value : null;
  const currentDepth = chosenDepth ?? uniformDepth ?? null;
  const selectionLabel =
    chosenDepth != null ? `Top ${chosenDepth}` : selectionDepthLabel(selectedRows);
  const actionLabel = scopedRunActionLabel(
    selectedRows.length === 1 ? "Run check" : "Run checks",
    marketScope,
  );

  return (
    <ProjectReadOnlyTooltip>
      <CheckDepthSplitButton
        actionLabel={checksRunning ? "Starting..." : `${actionLabel} (${selectionLabel})`}
        currentDepth={currentDepth}
        disabled={readOnly || checksRunning}
        onAction={() =>
          chosenDepth != null ? onRunChecks(selectedIds, chosenDepth) : onRunChecks(selectedIds)
        }
        onDepthChange={onDepthChange}
        size="xs"
        spinning={checksRunning}
      />
    </ProjectReadOnlyTooltip>
  );
}
