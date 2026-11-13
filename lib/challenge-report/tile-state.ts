export const TILE_STATES = ["ok", "no_data", "not_connected"] as const;
export type TileState = (typeof TILE_STATES)[number];

export const CHALLENGE_TILE_IDS = [
  "clicks",
  "activeDays",
  "aiAnswers",
  "existingVsNew",
  "top10",
  "conversions",
  "topPages",
  "cost",
] as const;

export type ChallengeTileId = (typeof CHALLENGE_TILE_IDS)[number];

export function unavailableTile(state: "no_data" | "not_connected", reason: string) {
  return { reason, state } as const;
}
