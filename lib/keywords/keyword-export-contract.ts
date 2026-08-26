import { isPublicIdOfType } from "@/lib/db/public-id";
import {
  changeOptions,
  lastCheckOptions,
  positionBuckets,
  serpFeatures,
} from "@/lib/keywords/keyword-filter-model";
import { z } from "zod";
import {
  RANK_TRACKER_MAX_PAGE,
  RANK_TRACKER_PAGE_SIZES,
  RANK_TRACKER_SORT_FIELDS,
  type RankTrackerQueryState,
} from "./rank-tracker-query-types";

const positionIds = positionBuckets.map(({ id }) => id) as [
  RankTrackerQueryState["filters"]["position"][number],
  ...RankTrackerQueryState["filters"]["position"][number][],
];
const changeIds = changeOptions.map(({ id }) => id) as [
  RankTrackerQueryState["filters"]["change"],
  ...RankTrackerQueryState["filters"]["change"][],
];
const lastCheckIds = lastCheckOptions.map(({ id }) => id) as [
  RankTrackerQueryState["filters"]["lastCheck"],
  ...RankTrackerQueryState["filters"]["lastCheck"][],
];
const serpIds = serpFeatures.map(({ id }) => id) as [string, ...string[]];
const text = (max: number) => z.string().trim().max(max);

export const rankTrackerExportQuerySchema: z.ZodType<RankTrackerQueryState> = z
  .object({
    filters: z
      .object({
        change: z.enum(changeIds),
        contains: text(80),
        intents: z.array(text(80)).max(20),
        lastCheck: z.enum(lastCheckIds),
        position: z.array(z.enum(positionIds)).max(4),
        serp: z.array(z.enum(serpIds)).max(6),
        tags: z.array(text(40)).max(20),
        topics: z.array(text(80)).max(20),
        urlChanged: z.boolean(),
        volMax: z.number().finite().min(0).max(50),
        volMin: z.number().finite().min(0).max(50),
        wrongUrl: z.boolean(),
      })
      .strict()
      .refine(({ volMax, volMin }) => volMax >= volMin, "Invalid volume range."),
    grouped: z.literal(false),
    lens: z
      .object({
        device: z.enum(["all", "desktop", "mobile"]),
        locationId: text(120).nullable(),
      })
      .strict(),
    page: z.number().int().positive().max(RANK_TRACKER_MAX_PAGE),
    pageSize: z.union(RANK_TRACKER_PAGE_SIZES.map((size) => z.literal(size))),
    savedViewId: text(120).nullable(),
    search: text(120),
    sort: z
      .object({ direction: z.enum(["asc", "desc"]), field: z.enum(RANK_TRACKER_SORT_FIELDS) })
      .strict(),
  })
  .strict();

export type KeywordExportSelection =
  | { mode: "all" }
  | { keywordIds: string[]; mode: "selected" }
  | { mode: "query"; query: RankTrackerQueryState };

export const keywordExportSelectionSchema: z.ZodType<KeywordExportSelection> = z.discriminatedUnion(
  "mode",
  [
    z.object({ mode: z.literal("all") }).strict(),
    z
      .object({
        keywordIds: z
          .array(z.string().refine((value) => isPublicIdOfType(value, "kw"), "Keyword not found."))
          .max(500)
          .refine(
            (ids) => new Set(ids).size === ids.length,
            "Selected keyword IDs must be unique.",
          ),
        mode: z.literal("selected"),
      })
      .strict(),
    z.object({ mode: z.literal("query"), query: rankTrackerExportQuerySchema }).strict(),
  ],
);
