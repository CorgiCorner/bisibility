import { newMarketCreateSchema } from "@/lib/markets/create-input";
import { marketDeviceSelectionSchema } from "@/lib/markets/device-targets-input";
import { z } from "zod";
import {
  canonicalKeySchema,
  deviceSchema,
  KEYWORD_TEXT_MAX,
  keywordScheduleSchema,
  serpCitySchema,
  serpMarketNameSchema,
} from "./keyword";

export const keywordCreateReviewSchema = z
  .object({
    op: z.literal("keywords-create"),
    source: z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("market-create"), input: newMarketCreateSchema }),
        z.object({ kind: z.literal("market-devices"), input: marketDeviceSelectionSchema }),
      ])
      .optional(),
    scheduleId: z.string().min(1).nullable(),
    cadence: keywordScheduleSchema.nullable(),
    keywords: z
      .array(
        z.object({
          keyword: z.string().trim().min(1).max(KEYWORD_TEXT_MAX),
          device: deviceSchema,
          locationKey: canonicalKeySchema.optional(),
          location: serpMarketNameSchema.optional(),
          city: serpCitySchema,
          cadence: keywordScheduleSchema.nullable().optional(),
        }),
      )
      .max(2000),
  })
  .superRefine((value, ctx) => {
    if (!value.source && !value.keywords.length)
      ctx.addIssue({
        code: "custom",
        path: ["keywords"],
        message: "Choose keywords or a market source.",
      });
  });
export type KeywordCreateChange = z.infer<typeof keywordCreateReviewSchema> & {
  allowPausedSchedule?: true;
};
