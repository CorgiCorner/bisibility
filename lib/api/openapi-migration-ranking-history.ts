import { rankNormalizationVersions } from "@/lib/rank-check/normalization-version";
import { serpDepthValues } from "@/lib/serp/markets";

const position = { minimum: 1, type: ["integer", "null"] };
const rankingUrl = {
  description: "Absolute URL, path, null, or omitted.",
  maxLength: 500,
  type: ["string", "null"],
};

export const cloudImportRankingHistorySchema = {
  additionalProperties: false,
  properties: {
    checkedAt: { format: "date-time", type: "string" },
    normalizationVersion: { enum: rankNormalizationVersions, type: "string" },
    position,
    previousPosition: position,
    provider: { maxLength: 120, minLength: 1, type: "string" },
    rankingUrl,
    requestedDepth: { enum: serpDepthValues, type: ["integer", "null"] },
  },
  required: [
    "checkedAt",
    "normalizationVersion",
    "position",
    "previousPosition",
    "provider",
    "rankingUrl",
    "requestedDepth",
  ],
  type: "object",
};
