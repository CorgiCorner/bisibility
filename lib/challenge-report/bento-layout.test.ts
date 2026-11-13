import { describe, expect, it } from "vitest";
import { challengeBentoLayout } from "./bento-layout";
import type { ChallengeTileId } from "./tile-state";
import { CHALLENGE_TILE_IDS } from "./tile-state";

function rowSums(spans: ReturnType<typeof challengeBentoLayout>, axis: "lg" | "md", width: number) {
  const rows: number[] = [];
  let used = 0;
  for (const span of spans) {
    const size = span[axis];
    if (used + size > width) {
      rows.push(used);
      used = 0;
    }
    used += size;
  }
  if (used) rows.push(used);
  return rows;
}

describe("challenge bento layout", () => {
  it("uses the drawn spans when every tile is visible", () => {
    expect(challengeBentoLayout(CHALLENGE_TILE_IDS).map((span) => [span.id, span.lg])).toEqual([
      ["clicks", 8],
      ["activeDays", 4],
      ["aiAnswers", 3],
      ["existingVsNew", 3],
      ["top10", 3],
      ["conversions", 3],
      ["topPages", 8],
      ["cost", 4],
    ]);
  });

  it("packs eight, six and three tiles into full rows", () => {
    const sets: ChallengeTileId[][] = [
      [...CHALLENGE_TILE_IDS],
      ["clicks", "aiAnswers", "top10", "conversions", "topPages", "cost"],
      ["clicks", "top10", "cost"],
    ];
    for (const set of sets) {
      const layout = challengeBentoLayout(set);
      expect(rowSums(layout, "lg", 12).every((sum) => sum === 12)).toBe(true);
      expect(rowSums(layout, "md", 2).every((sum) => sum === 2)).toBe(true);
    }
  });
});
