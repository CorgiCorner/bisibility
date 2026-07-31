import { keywordLocation } from "@/lib/api/keyword-utils";
import { keywordCreateItemSchema } from "@/lib/api/schemas";
import { parsePublicId } from "@/lib/db/public-id";
import { z } from "zod";
import { importHistorySchema, legacyImportHistorySchema } from "./history-schema";

const strictKeywordId = z.string().refine((value) => parsePublicId(value)?.prefix === "kw", {
  message: "Expected a strict kw_ v3 public ID.",
});
const importKeywordShape = {
  device: keywordCreateItemSchema.shape.device,
  id: strictKeywordId,
  keyword: keywordCreateItemSchema.shape.keyword,
  location: keywordCreateItemSchema.shape.location.unwrap(),
  tags: keywordCreateItemSchema.shape.tags,
  target_url: keywordCreateItemSchema.shape.target_url,
};

function keywordSchemaWithHistory<T extends z.ZodType>(history: T) {
  return z
    .object({
      ...importKeywordShape,
      rankingHistory: z.array(history).max(5000).default([]),
    })
    .strict()
    .transform((value) => ({
      device: value.device,
      id: value.id,
      keyword: value.keyword,
      location: keywordLocation(value),
      rankingHistory: value.rankingHistory,
      tags: value.tags,
      target_url: value.target_url ?? null,
    }));
}

export const importKeywordSchema = keywordSchemaWithHistory(importHistorySchema);
export const legacyImportKeywordSchema = keywordSchemaWithHistory(legacyImportHistorySchema);
