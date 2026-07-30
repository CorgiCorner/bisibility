import { z } from "zod";
import { canonicalKeySchema, intentSchema, KEYWORD_TEXT_MAX } from "./keyword";

const idSchema = z.string().trim().min(1).max(120);
const keywordSnapshotTextSchema = z
  .string()
  .trim()
  .min(1)
  .max(KEYWORD_TEXT_MAX)
  .transform((value) => value.replace(/\s+/g, " "));
const trendPointSchema = z.object({
  month: z.number().int().min(1).max(12),
  searchVolume: z.number().int().nonnegative().nullable(),
  year: z.number().int().min(2000).max(2200),
});

export const saveKeywordsSchema = z.object({
  projectId: idSchema,
  rows: z
    .array(
      z.object({
        cpcCents: z.number().int().nonnegative().nullable().optional(),
        difficulty: z.number().int().min(0).max(100).nullable().optional(),
        intent: intentSchema,
        keyword: keywordSnapshotTextSchema,
        location: canonicalKeySchema,
        monthlyTrend: z.array(trendPointSchema).max(24).nullable().optional(),
        searchVolume: z.number().int().nonnegative().nullable().optional(),
        sourceSeed: keywordSnapshotTextSchema.nullable().optional(),
        variantCount: z.number().int().nonnegative().default(0),
      }),
    )
    .min(1)
    .max(500),
});

export const removeSavedKeywordsSchema = z.union([
  z.object({
    projectId: idSchema,
    publicIds: z.array(idSchema).min(1).max(500),
  }),
  z.object({
    projectId: idSchema,
    rows: z
      .array(
        z.object({
          keyword: keywordSnapshotTextSchema,
          location: canonicalKeySchema,
        }),
      )
      .min(1)
      .max(500),
  }),
]);

export type SaveKeywordsInput = z.input<typeof saveKeywordsSchema>;
export type RemoveSavedKeywordsInput = z.input<typeof removeSavedKeywordsSchema>;
