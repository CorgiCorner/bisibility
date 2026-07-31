import { rankNormalizationVersions } from "@/lib/rank-check/normalization-version";
import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { z } from "zod";

const rankPositionSchema = z.number().int().min(1).nullable();
const optionalRankPositionSchema = rankPositionSchema.optional();
const rankingUrlSchema = z
  .string()
  .max(500)
  .refine((value) => value.startsWith("/") || URL.canParse(value), {
    message: "Ranking URL must be an absolute URL or a path.",
  })
  .nullable();

export const importHistorySchema = z
  .object({
    checkedAt: z.iso.datetime().transform((value) => new Date(value)),
    normalizationVersion: z.enum(rankNormalizationVersions),
    position: rankPositionSchema,
    previousPosition: rankPositionSchema,
    provider: z.string().trim().min(1).max(120),
    rankingUrl: rankingUrlSchema,
    requestedDepth: serpDepthSchema.nullable(),
  })
  .strict();

export const legacyImportHistorySchema = z
  .object({
    checkedAt: z.iso.datetime().transform((value) => new Date(value)),
    position: optionalRankPositionSchema,
    previousPosition: optionalRankPositionSchema,
    rankingUrl: rankingUrlSchema.optional(),
  })
  .strict();
