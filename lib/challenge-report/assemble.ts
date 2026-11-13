import type { ChallengePeriod, ChallengeStage } from "./period";
import type { ChallengeReportBody, ChallengeTile } from "./schema";
import { emptyChallengeLessons } from "./schema";
import type { ChallengeTileId } from "./tile-state";
import { CHALLENGE_TILE_IDS, unavailableTile } from "./tile-state";

const sourceByTile = {
  activeDays: "practice_days",
  aiAnswers: "ai_visibility",
  clicks: "search_console",
  conversions: "conversions",
  cost: "usage",
  existingVsNew: "pages",
  top10: "rank_tracker",
  topPages: "search_console",
} as const satisfies Record<ChallengeTileId, ChallengeReportBody["sources"][number]>;

export type SettledTiles = Record<ChallengeTileId, PromiseSettledResult<ChallengeTile>>;

export function assembleChallengeReport(input: {
  generatedAt: string;
  lessons: ChallengeReportBody["lessons"];
  period: ChallengePeriod;
  settled: SettledTiles;
  stage: ChallengeStage;
}): ChallengeReportBody {
  const tiles = {} as ChallengeReportBody["tiles"];
  const bucket = tiles as Record<ChallengeTileId, ChallengeTile>;
  const sources: ChallengeReportBody["sources"] = [];
  for (const id of CHALLENGE_TILE_IDS) {
    const result = input.settled[id];
    const tile: ChallengeTile =
      result.status === "fulfilled" ? result.value : unavailableTile("no_data", "tile_failed");
    bucket[id] = tile;
    if (tile.state === "ok" && !sources.includes(sourceByTile[id])) sources.push(sourceByTile[id]);
  }
  return {
    generatedAt: input.generatedAt,
    lessons: input.lessons,
    period: input.period,
    sources,
    stage: input.stage,
    tiles,
    version: 1,
  };
}

export async function settleChallengeTiles(
  loaders: Record<ChallengeTileId, () => Promise<ChallengeTile>>,
): Promise<SettledTiles> {
  const settled = await Promise.allSettled(CHALLENGE_TILE_IDS.map((id) => loaders[id]()));
  return Object.fromEntries(
    CHALLENGE_TILE_IDS.map((id, index) => [id, settled[index]]),
  ) as SettledTiles;
}

export function challengeLessonsOrEmpty(lessons: ChallengeReportBody["lessons"] | undefined) {
  return lessons ?? emptyChallengeLessons;
}
