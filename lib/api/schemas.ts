import { webhookHmacSecretSchema, webhookUrlSchema } from "@/lib/alerts/webhook-schema";
import { apiKeyScopeSchema } from "@/lib/schemas/apiKey";
import {
  canonicalKeySchema,
  deviceSchema,
  intentSchema,
  KEYWORD_TEXT_MAX,
  keywordScheduleSchema,
  rankCheckFrequencySchema,
  serpCitySchema,
  serpMarketNameSchema,
  targetUrlSchema,
  topicSchema,
} from "@/lib/schemas/keyword";
import { z } from "zod";

const idSchema = z.string().trim().min(1).max(160);
const tagSchema = z.string().trim().min(1).max(48);
export const KEYWORD_MATCH_MAX_TEXTS = 50;

function emptyStringToUndefined(value: unknown) {
  return value === "" ? undefined : value;
}

function normalizeScheduleKeys(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return value;
  const schedule = value as Record<string, unknown>;
  return {
    ...schedule,
    cronExpression: schedule.cronExpression ?? schedule.cron_expression,
    jitterMinutes: schedule.jitterMinutes ?? schedule.jitter_minutes,
    serpDepth: schedule.serpDepth ?? schedule.serp_depth,
  };
}

const apiKeywordScheduleSchema = z.preprocess(normalizeScheduleKeys, keywordScheduleSchema);

export const apiKeyCreateSchema = z.object({
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(null),
  name: z.string().trim().min(1).max(80),
  scope: apiKeyScopeSchema.default("admin"),
});

// Parsed via parseApiInput, which camelizes snake_case body keys
// (expires_in_days → expiresInDays).
export const personalTokenCreateSchema = z.object({
  expiresInDays: z
    .union([z.literal(30), z.literal(90), z.literal(365)])
    .nullable()
    .default(null),
  name: z.string().trim().min(1).max(80),
  scope: z.enum(["admin", "read", "write"]).default("read"),
});

export const mePatchSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

export const webhookCreateSchema = z.object({
  description: z.string().trim().max(160).nullable().default(null),
  enabled: z.boolean().default(true),
  hmacSecret: webhookHmacSecretSchema,
  url: webhookUrlSchema,
});

export const webhookPatchSchema = z
  .object({
    description: z.string().trim().max(160).nullable().optional(),
    enabled: z.boolean().optional(),
    hmacSecret: webhookHmacSecretSchema.optional(),
    url: webhookUrlSchema.optional(),
  })
  .refine((value) => Object.values(value).some((field) => field !== undefined), {
    message: "At least one field is required.",
  });

export const keywordCreateItemSchema = z.object({
  city: serpCitySchema,
  country: serpMarketNameSchema.optional(),
  device: deviceSchema.optional(),
  intent: intentSchema,
  keyword: z.string().trim().min(1).max(180),
  location: serpMarketNameSchema.optional(),
  location_key: canonicalKeySchema.optional(),
  schedule: apiKeywordScheduleSchema.optional(),
  tags: z.array(tagSchema).max(12).default([]),
  target_url: targetUrlSchema,
  topic: topicSchema,
});

export const keywordPatchSchema = z.object({
  city: serpCitySchema,
  country: z.preprocess(emptyStringToUndefined, serpMarketNameSchema.optional()),
  device: deviceSchema.optional(),
  frequency: rankCheckFrequencySchema.optional(),
  intent: intentSchema,
  keyword: z.preprocess(emptyStringToUndefined, z.string().trim().min(1).max(180).optional()),
  location: z.preprocess(emptyStringToUndefined, serpMarketNameSchema.optional()),
  location_key: z.preprocess(emptyStringToUndefined, canonicalKeySchema.optional()),
  schedule: apiKeywordScheduleSchema.optional(),
  tags: z.array(tagSchema).max(12).optional(),
  target_url: targetUrlSchema,
  topic: topicSchema,
});

export const keywordMatchRequestSchema = z.object({
  texts: z
    .array(z.string().trim().min(1).max(KEYWORD_TEXT_MAX))
    .min(1)
    .max(KEYWORD_MATCH_MAX_TEXTS),
});

export const keywordBulkSchema = z
  .object({
    frequency: rankCheckFrequencySchema.optional(),
    keyword_ids: z.array(idSchema).min(1).max(500),
    operation: z.enum(["add_tags", "delete", "remove_tags", "set_frequency", "set_target_url"]),
    schedule: apiKeywordScheduleSchema.optional(),
    tags: z.array(tagSchema).max(12).optional(),
    target_url: targetUrlSchema,
  })
  .superRefine((value, ctx) => {
    if (["add_tags", "remove_tags"].includes(value.operation) && !value.tags?.length) {
      ctx.addIssue({
        code: "custom",
        message: "tags are required for tag bulk operations.",
        path: ["tags"],
      });
    }
    if (value.operation === "set_frequency" && !value.frequency && !value.schedule) {
      ctx.addIssue({
        code: "custom",
        message: "frequency or schedule is required.",
        path: ["frequency"],
      });
    }
  });

export const runRankCheckSchema = z.object({
  provider_id: z.string().trim().min(1).max(80).optional(),
});

export type ApiKeywordCreateItem = z.infer<typeof keywordCreateItemSchema>;
export type ApiKeywordPatch = z.infer<typeof keywordPatchSchema>;
export type ApiKeywordBulk = z.infer<typeof keywordBulkSchema>;
