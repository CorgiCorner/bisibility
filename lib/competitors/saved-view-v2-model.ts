import {
  presentationIdSchema,
  tablePresentationSchema,
} from "@/lib/saved-views/presentation-model";
import { z } from "zod";
import { type CompetitorSavedViewConfig, competitorFilterSchema } from "./saved-view-model";
import { COMPETITOR_ENGINE } from "./scope-model";

export const competitorSavedViewV2Schema = z
  .object({
    filters: competitorFilterSchema.refine(
      (filter) => filter.excludedKeywordIds.every((id) => id.length <= 128),
      "Keyword IDs must use 128 characters or fewer",
    ),
    grouped: z.boolean(),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    presentation: tablePresentationSchema,
    scope: z
      .object({
        device: z.enum(["desktop", "mobile"]),
        engine: z.literal(COMPETITOR_ENGINE),
        locationId: z.string().trim().min(1).max(128),
      })
      .strict(),
    sort: z.object({ direction: z.enum(["asc", "desc"]), field: presentationIdSchema }).strict(),
    surface: z.literal("competitors"),
    version: z.literal(2),
  })
  .strict();

export type CompetitorSavedViewV2Config = z.infer<typeof competitorSavedViewV2Schema>;
export type CompetitorViewConfig = CompetitorSavedViewConfig | CompetitorSavedViewV2Config;

export function competitorViewLegacyScope(config: CompetitorViewConfig): CompetitorSavedViewConfig {
  return {
    filters: {
      ...config.filters,
      excludedKeywordIds: [...config.filters.excludedKeywordIds],
    },
    scope: { ...config.scope },
    surface: "competitors",
    version: 1,
  };
}
