import { MAX_PROJECT_MARKETS } from "@/lib/markets/limits";
import { normalizeCanonicalLocationKey } from "@/lib/serp/location";
import {
  DEFAULT_SERP_DEVICE,
  DEFAULT_SERP_MARKET,
  normalizeSerpMarketName,
  serpDeviceValues,
  serpMarketNames,
} from "@/lib/serp/markets";
import { isSupportedProjectTimezone } from "@/lib/settings/timezones";
import { z } from "zod";
import { serpDepthSchema } from "./serp-depth";

const idSchema = z.string().trim().min(1).max(120);
const tagSchema = z.string().trim().min(1).max(48);
const unsupportedSerpMarketMessage = "Choose a supported SERP country.";
export const KEYWORD_IMPORT_MAX = 500;
export const KEYWORD_IMPORT_LIMIT_MESSAGE = "Add up to 500 keywords per import.";
export const KEYWORD_TEXT_MAX = 180;
export const JITTER_MINUTES_MAX = 120;
export const JITTER_MINUTES_MIN = 0;
export const JITTER_MINUTES_RANGE_MESSAGE = "Jitter must be a whole number from 0 to 120 minutes.";

// Bound parsed input work before deduplication; duplicate rows intentionally count toward the cap.
export function keywordImportFileLimitMessage(received: number) {
  return `This file contains ${received} rows; the maximum is ${KEYWORD_IMPORT_MAX}. Duplicate rows count toward this limit. Remove duplicates, reduce the file, or split it into multiple imports.`;
}

const emptyToNull = (value: unknown) => (value === "" ? null : value);
const normalizeSerpMarketInput = (value: unknown) => normalizeSerpMarketName(value) ?? value;

export const serpMarketNameSchema = z.preprocess(
  normalizeSerpMarketInput,
  z.enum(serpMarketNames, { error: unsupportedSerpMarketMessage }),
);

export const canonicalKeySchema = z
  .string()
  .trim()
  .max(260)
  .superRefine((value, ctx) => {
    try {
      normalizeCanonicalLocationKey(value);
    } catch (error) {
      ctx.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Choose a supported location.",
      });
    }
  });

export const locationSelectionSchema = z.union([
  z.object({ country: serpMarketNameSchema }),
  z.object({ locationKey: canonicalKeySchema }),
]);

// Cities remain open strings resolved server-side; unresolved cities degrade to
// country level.
export const serpCitySchema = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).max(120).nullable().optional(),
);

export const topicSchema = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).max(80).nullable().optional(),
);

export const intentSchema = z.preprocess(
  emptyToNull,
  z.string().trim().min(1).max(80).nullable().optional(),
);

export const deviceSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.toLowerCase() : value),
  z.enum(serpDeviceValues),
);

export const rankCheckFrequencySchema = z.enum([
  "paused",
  "manual",
  "daily",
  "weekly",
  "monthly",
  "custom_cron",
]);

export const targetUrlValueSchema = z
  .string()
  .trim()
  .min(1, "Enter a target URL.")
  .max(500)
  .refine((value) => value.startsWith("/") || URL.canParse(value), {
    message: "Target URL must be an absolute URL or a path.",
  });

export const targetUrlSchema = z.preprocess(
  emptyToNull,
  targetUrlValueSchema.nullable().optional(),
);

export const keywordScheduleBaseSchema = z.object({
  cronExpression: z.preprocess(
    emptyToNull,
    z.string().trim().min(1).max(120).nullable().default(null),
  ),
  frequency: rankCheckFrequencySchema,
  jitterMinutes: z.coerce
    .number()
    .int(JITTER_MINUTES_RANGE_MESSAGE)
    .min(JITTER_MINUTES_MIN, JITTER_MINUTES_RANGE_MESSAGE)
    .max(JITTER_MINUTES_MAX, JITTER_MINUTES_RANGE_MESSAGE)
    .default(60),
  serpDepth: serpDepthSchema.nullable().optional(),
  timezone: z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(isSupportedProjectTimezone, { message: "Select a valid time zone." })
    .default("UTC"),
});

function requireCustomCron(value: z.infer<typeof keywordScheduleBaseSchema>, ctx: z.RefinementCtx) {
  if (value.frequency === "custom_cron" && !value.cronExpression) {
    ctx.addIssue({
      code: "custom",
      message: "Custom cron schedules require a cron expression.",
      path: ["cronExpression"],
    });
  }
}

export const keywordScheduleSchema = keywordScheduleBaseSchema.superRefine(requireCustomCron);

export const addKeywordSchema = z.object({
  city: serpCitySchema,
  device: deviceSchema.default(DEFAULT_SERP_DEVICE),
  keyword: z
    .string()
    .trim()
    .min(1)
    .max(KEYWORD_TEXT_MAX, `String must contain at most ${KEYWORD_TEXT_MAX} character(s)`),
  location: serpMarketNameSchema.default(DEFAULT_SERP_MARKET),
  locationKey: canonicalKeySchema.optional(),
  projectId: idSchema,
  schedule: keywordScheduleSchema.optional(),
  tags: z.array(tagSchema).max(12).default([]),
  targetUrl: targetUrlSchema,
  topic: topicSchema,
  intent: intentSchema,
});

export const addKeywordsRowSchema = addKeywordSchema.omit({
  projectId: true,
  schedule: true,
});

export const addKeywordsSchema = addKeywordSchema
  .omit({ keyword: true })
  .extend({
    consumeSavedIds: z.array(idSchema).max(500).optional(),
    keywords: z.array(addKeywordSchema.shape.keyword).min(1).max(KEYWORD_IMPORT_MAX).optional(),
    rows: z
      .array(addKeywordsRowSchema)
      .min(1)
      .max(KEYWORD_IMPORT_MAX, `Array must contain at most ${KEYWORD_IMPORT_MAX} element(s)`)
      .optional(),
  })
  .superRefine((value, ctx) => {
    const keywordCount = value.keywords?.length ?? 0;
    const rowCount = value.rows?.length ?? 0;
    if (keywordCount === 0 && rowCount === 0) {
      ctx.addIssue({
        code: "custom",
        message: "Add at least one keyword.",
        path: ["keywords"],
      });
    }
    if (keywordCount > 0 && rowCount > 0) {
      ctx.addIssue({
        code: "custom",
        message: "Use either keyword text or CSV rows.",
        path: ["rows"],
      });
    }
  });

export const addKeywordsMatrixSchema = z
  .object({
    consumeSavedIds: z.array(idSchema).max(500).optional(),
    devices: z.array(deviceSchema).min(1),
    keywords: z
      .array(z.string().trim().min(1).max(KEYWORD_TEXT_MAX))
      .min(1)
      .max(KEYWORD_IMPORT_MAX, KEYWORD_IMPORT_LIMIT_MESSAGE),
    locations: z.array(locationSelectionSchema).min(1),
    projectId: addKeywordSchema.shape.projectId,
    schedule: addKeywordSchema.shape.schedule,
    tags: addKeywordSchema.shape.tags,
    targetUrl: addKeywordSchema.shape.targetUrl,
    topic: addKeywordSchema.shape.topic,
    intent: addKeywordSchema.shape.intent,
  })
  .superRefine((value, ctx) => {
    const combos = value.keywords.length * value.locations.length * value.devices.length;
    if (combos > 2000) {
      ctx.addIssue({
        code: "custom",
        message: `This import creates ${combos} tracked keywords; the limit is 2000 per import.`,
        path: ["keywords"],
      });
    }
  });

export const updateKeywordSchema = z.object({
  city: serpCitySchema,
  device: deviceSchema.optional(),
  keyword: z.string().trim().min(1).max(KEYWORD_TEXT_MAX).optional(),
  keywordId: idSchema,
  location: serpMarketNameSchema.optional(),
  locationKey: canonicalKeySchema.optional(),
  tags: z.array(tagSchema).max(12).optional(),
  targetUrl: targetUrlSchema,
  topic: topicSchema,
  intent: intentSchema,
});

export const bulkKeywordIdsSchema = z.object({
  keywordIds: z.array(idSchema).min(1).max(500),
  projectId: idSchema,
});

export const bulkKeywordTagSchema = bulkKeywordIdsSchema.extend({
  tags: z.array(tagSchema).min(1).max(12),
});

export const bulkKeywordTargetSchema = bulkKeywordIdsSchema.extend({
  targetUrl: targetUrlValueSchema,
});

export const bulkKeywordFrequencySchema = bulkKeywordIdsSchema.extend({
  schedule: keywordScheduleSchema,
});

export const keywordScheduleUpdateSchema = keywordScheduleBaseSchema
  .extend({
    keywordId: idSchema,
  })
  .superRefine(requireCustomCron);

export const runCheckNowSchema = z.object({
  depth: serpDepthSchema.optional(),
  keywordId: idSchema,
  providerId: z.string().trim().min(1).max(80).optional(),
});

export const listFirstCheckCandidatesSchema = z.object({
  keywordText: z.string().trim().min(1).max(KEYWORD_TEXT_MAX).optional(),
  limit: z.coerce
    .number()
    .int()
    .min(1)
    .max(MAX_PROJECT_MARKETS * serpDeviceValues.length)
    .default(3),
  projectId: idSchema,
});

export const getFirstCheckRunPlanSchema = z.object({ projectId: idSchema });

export const runFirstCheckPreviewSchema = z.object({
  keywordId: idSchema,
});

export const getObservedPositionsSchema = z.object({
  projectId: idSchema,
});

export const queueFirstChecksSchema = z.object({
  excludeKeywordIds: z.array(idSchema).optional(),
  projectId: idSchema,
});

export type AddKeywordInput = z.infer<typeof addKeywordSchema>;
export type AddKeywordsInput = z.input<typeof addKeywordsSchema>;
export type AddKeywordsMatrixInput = z.infer<typeof addKeywordsMatrixSchema>;
export type AddKeywordsRowInput = z.infer<typeof addKeywordsRowSchema>;
export type BulkKeywordFrequencyInput = z.infer<typeof bulkKeywordFrequencySchema>;
export type BulkKeywordIdsInput = z.infer<typeof bulkKeywordIdsSchema>;
export type BulkKeywordTagInput = z.infer<typeof bulkKeywordTagSchema>;
export type BulkKeywordTargetInput = z.infer<typeof bulkKeywordTargetSchema>;
export type KeywordScheduleInput = z.infer<typeof keywordScheduleSchema>;
export type KeywordScheduleUpdateInput = z.infer<typeof keywordScheduleUpdateSchema>;
export type GetFirstCheckRunPlanInput = z.infer<typeof getFirstCheckRunPlanSchema>;
export type ListFirstCheckCandidatesInput = z.input<typeof listFirstCheckCandidatesSchema>;
export type RunFirstCheckPreviewInput = z.infer<typeof runFirstCheckPreviewSchema>;
export type GetObservedPositionsInput = z.infer<typeof getObservedPositionsSchema>;
export type QueueFirstChecksInput = z.infer<typeof queueFirstChecksSchema>;
export type RunCheckNowInput = z.infer<typeof runCheckNowSchema>;
export type UpdateKeywordInput = z.infer<typeof updateKeywordSchema>;
