import {
  RANK_TRACKER_PAGE_SIZES,
  RANK_TRACKER_SORT_FIELDS,
} from "@/lib/keywords/rank-tracker-query-types";
import { tablePresentationSchema } from "@/lib/saved-views/presentation-model";
import { z } from "zod";
import {
  defaultRankTrackerReportScope,
  rankTrackerReportScopeSchema,
} from "./rank-tracker-report-scope";
import { type SavedViewConfig, savedViewFiltersSchema } from "./saved-view-model";

const strictFilters = z
  .unknown()
  .superRefine((value, context) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return;
    for (const key of ["country", "city", "device"]) {
      if (Object.hasOwn(value, key))
        context.addIssue({ code: "custom", message: "Use the explicit lens for market scope" });
    }
  })
  .pipe(savedViewFiltersSchema);

export const keywordSavedViewV2Schema = z
  .object({
    reportScope: rankTrackerReportScopeSchema.default(() => ({ ...defaultRankTrackerReportScope })),
    filters: strictFilters,
    grouped: z.boolean(),
    lens: z
      .object({
        device: z.enum(["all", "desktop", "mobile"]),
        locationId: z.string().trim().min(1).max(128).nullable(),
      })
      .strict(),
    pageSize: z.union(RANK_TRACKER_PAGE_SIZES.map((size) => z.literal(size))),
    presentation: tablePresentationSchema,
    search: z.string().trim().max(120),
    sort: z
      .object({ direction: z.enum(["asc", "desc"]), field: z.enum(RANK_TRACKER_SORT_FIELDS) })
      .strict(),
    surface: z.literal("keywords"),
    version: z.literal(2),
  })
  .strict();

export type KeywordSavedViewV2Config = z.infer<typeof keywordSavedViewV2Schema>;
export type KeywordViewConfig = SavedViewConfig | KeywordSavedViewV2Config;

export function keywordSavedViewConfigV2(
  config: Omit<z.input<typeof keywordSavedViewV2Schema>, "surface" | "version">,
) {
  return keywordSavedViewV2Schema.parse({ ...config, surface: "keywords", version: 2 });
}

export function keywordViewLegacyScope(config: KeywordViewConfig): SavedViewConfig {
  return {
    filters: structuredClone(config.filters),
    lens: { ...config.lens },
    search: config.search,
    surface: "keywords",
    version: 1,
  };
}
