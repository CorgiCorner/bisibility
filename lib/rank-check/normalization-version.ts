export const rankNormalizationVersions = ["v1", "v2"] as const;

export const RANK_NORMALIZATION_VERSION = {
  LEGACY: rankNormalizationVersions[0],
  ORGANIC_BEST_MATCH: rankNormalizationVersions[1],
} as const;

export type RankNormalizationVersion =
  (typeof RANK_NORMALIZATION_VERSION)[keyof typeof RANK_NORMALIZATION_VERSION];

export const CURRENT_RANK_NORMALIZATION_VERSION = RANK_NORMALIZATION_VERSION.ORGANIC_BEST_MATCH;

export function isRankNormalizationVersion(value: unknown): value is RankNormalizationVersion {
  return Object.values(RANK_NORMALIZATION_VERSION).includes(value as RankNormalizationVersion);
}

export function requireRankNormalizationVersion(value: unknown): RankNormalizationVersion {
  if (!isRankNormalizationVersion(value)) {
    throw new Error("Completed rank check is missing a supported normalization version.");
  }
  return value;
}
