"use client";

import { SegmentedControl } from "@/components/ui";
import {
  buildMarketGridViewRows,
  marketGridDefaultsToGrouped,
  marketGridParent,
  selectedMarketTargetIds,
} from "@/lib/keywords/market-grid-model";
import type { KeywordRow } from "@/lib/queries/keywords";
import type { GridSortModel } from "@mui/x-data-grid";
import { useMemo, useState } from "react";

export function useMarketGridView(rows: readonly KeywordRow[]) {
  const [grouped, setGrouped] = useState(() => marketGridDefaultsToGrouped(rows));
  const [expandedParentIds, setExpandedParentIds] = useState<Set<string>>(() => new Set());
  const [sortModel, setSortModel] = useState<GridSortModel>([{ field: "position", sort: "asc" }]);
  const viewRows = useMemo(
    () =>
      buildMarketGridViewRows(
        rows,
        grouped,
        expandedParentIds,
        sortModel[0]?.sort ? { field: sortModel[0].field, sort: sortModel[0].sort } : null,
      ),
    [expandedParentIds, grouped, rows, sortModel],
  );

  function toggleParent(row: KeywordRow) {
    if (!marketGridParent(row)) return false;
    setExpandedParentIds((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
    return true;
  }

  return {
    groupingControl: (
      <SegmentedControl
        activeVariant="neutral"
        ariaLabel="Keyword grouping"
        fitContent
        onChange={(value) => setGrouped(value === "grouped")}
        options={[
          { label: "Grouped", value: "grouped" },
          { label: "Flat", value: "flat" },
        ]}
        size="toolbar"
        value={grouped ? "grouped" : "flat"}
      />
    ),
    selectedTargetIds: (ids: ReadonlySet<string>) => selectedMarketTargetIds(viewRows, ids),
    setSortModel,
    sortModel,
    sortingMode: grouped ? ("server" as const) : ("client" as const),
    toggleParent,
    viewRows,
  };
}
