import type { KeywordRow } from "@/lib/queries/keywords";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/markets";

type DepthRow = Pick<KeywordRow, "projectSerpDepth" | "schedule">;

export function effectiveRowDepth(row: DepthRow): SerpDepth {
  return row.schedule.serp_depth ?? row.projectSerpDepth ?? DEFAULT_SERP_DEPTH;
}

export function selectionDepthLabel(rows: readonly DepthRow[]) {
  const depths = new Set(rows.map(effectiveRowDepth));
  return depths.size === 1 ? `Top ${depths.values().next().value}` : "keyword defaults";
}
