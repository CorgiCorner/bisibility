import { legacyMarketNameSchema } from "@/lib/api/legacy-market-input";
import { keywordCreateItemSchema } from "@/lib/api/schemas";
import { parsePublicId } from "@/lib/db/public-id";
import { canonicalKeySchema } from "@/lib/schemas/keyword";
import { normalizeCanonicalLocationKey } from "@/lib/serp/location";
import { z } from "zod";
import { importHistorySchema, legacyImportHistorySchema } from "./history-schema";

const strictKeywordId = z.string().refine((value) => parsePublicId(value)?.prefix === "kw", {
  message: "Expected a strict kw_ v3 public ID.",
});
const importLocationLabelSchema = z.string().trim().min(1).max(240);
const importKeywordShape = {
  device: keywordCreateItemSchema.shape.device,
  id: strictKeywordId,
  keyword: keywordCreateItemSchema.shape.keyword,
  location: importLocationLabelSchema,
  location_key: canonicalKeySchema.optional(),
  tags: keywordCreateItemSchema.shape.tags,
  target_url: keywordCreateItemSchema.shape.target_url,
};

type LocationKeyPolicy = "forbidden" | "optional" | "required";

function keywordSchemaWithHistory<T extends z.ZodType>(history: T, locationKey: LocationKeyPolicy) {
  return z
    .object({
      ...importKeywordShape,
      rankingHistory: z.array(history).max(5000).default([]),
    })
    .strict()
    .superRefine((value, ctx) => {
      if (locationKey === "forbidden" && value.location_key !== undefined) {
        ctx.addIssue({
          code: "custom",
          message: "location_key requires a version 7 package.",
          path: ["location_key"],
        });
      }
      if (locationKey === "required" && value.location_key === undefined) {
        ctx.addIssue({
          code: "custom",
          message: "location_key is required in version 7 packages.",
          path: ["location_key"],
        });
      }
      if (value.location_key === undefined) {
        const parsed = legacyMarketNameSchema.safeParse(value.location);
        if (!parsed.success) {
          for (const issue of parsed.error.issues) {
            ctx.addIssue({ ...issue, path: ["location", ...issue.path] });
          }
        }
      }
    })
    .transform((value) => ({
      device: value.device,
      id: value.id,
      keyword: value.keyword,
      location:
        value.location_key === undefined
          ? legacyMarketNameSchema.parse(value.location)
          : value.location,
      location_key: value.location_key
        ? normalizeCanonicalLocationKey(value.location_key).canonicalKey
        : undefined,
      rankingHistory: value.rankingHistory,
      tags: value.tags,
      target_url: value.target_url ?? null,
    }));
}

/** Session chunks can come from a previous exporter, so their canonical key is optional. */
export const importKeywordSchema = keywordSchemaWithHistory(importHistorySchema, "optional");
export const legacyImportKeywordSchema = keywordSchemaWithHistory(
  legacyImportHistorySchema,
  "forbidden",
);
export const version6ImportKeywordSchema = keywordSchemaWithHistory(
  importHistorySchema,
  "forbidden",
);
export const version7ImportKeywordSchema = keywordSchemaWithHistory(
  importHistorySchema,
  "required",
);
