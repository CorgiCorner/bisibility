import type { KeywordRow } from "@/lib/queries/keywords";
import { DEFAULT_SERP_DEPTH, type SerpDepth } from "@/lib/serp/constants";

type DepthRow = Pick<KeywordRow, "projectSerpDepth" | "schedule">;

export function effectiveRowDepth(row: DepthRow): SerpDepth {
  return row.schedule.serp_depth ?? row.projectSerpDepth ?? DEFAULT_SERP_DEPTH;
}

export function selectionDepthLabel(
  rows: readonly DepthRow[],
  formatDepth: (depth: SerpDepth) => string = (depth) => `Top ${depth}`,
) {
  const depths = new Set(rows.map(effectiveRowDepth));
  return [...depths]
    .sort((a, b) => a - b)
    .map(formatDepth)
    .join(" / ");
}
