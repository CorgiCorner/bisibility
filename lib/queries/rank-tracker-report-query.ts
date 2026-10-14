import {
  RANK_TRACKER_MAX_PAGE,
  RANK_TRACKER_SORT_FIELDS,
  type RankTrackerQueryState,
} from "@/lib/keywords/rank-tracker-query-types";
import {
  defaultRankTrackerReportScope,
  rankTrackerReportScopeSchema,
} from "@/lib/keywords/rank-tracker-report-scope";
import { z } from "zod";

const names = z.array(z.string().trim().max(80)).max(20);
const schema = z
  .object({
    reportScope: rankTrackerReportScopeSchema.default(() => ({ ...defaultRankTrackerReportScope })),
    filters: z
      .object({
        change: z.enum(["any", "up", "down", "new", "lost"]),
        contains: z.string().trim().max(80),
        intents: names,
        lastCheck: z.enum(["any", "completed", "failed", "not_checked", "running"]),
        position: z.array(z.enum(["top3", "top10", "11-50", "51-100"])).max(4),
        serp: z.array(z.enum(["featured", "paa", "sitelinks", "image", "video", "ai"])).max(6),
        tags: z.array(z.string().trim().max(40)).max(20),
        topics: names,
        volMax: z.number().finite().min(0).max(50),
        volMin: z.number().finite().min(0).max(50),
        wrongUrl: z.boolean(),
        urlChanged: z.boolean(),
      })
      .strict()
      .refine((f) => f.volMin <= f.volMax, "Volume bounds are reversed"),
    grouped: z.boolean(),
    lens: z
      .object({
        device: z.enum(["all", "desktop", "mobile"]),
        locationId: z.string().trim().max(120).nullable(),
      })
      .strict(),
    page: z.int().min(1).max(RANK_TRACKER_MAX_PAGE),
    pageSize: z.union([z.literal(25), z.literal(50), z.literal(100)]),
    savedViewId: z.string().trim().max(120).nullable(),
    search: z.string().trim().max(120),
    sort: z
      .object({ direction: z.enum(["asc", "desc"]), field: z.enum(RANK_TRACKER_SORT_FIELDS) })
      .strict(),
  })
  .strict();

export function validateRankTrackerReportQuery(input: unknown): RankTrackerQueryState {
  return schema.parse(input);
}
