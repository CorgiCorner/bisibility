import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { z } from "zod";
import { PROMPT_CATEGORIES, TRACKING_ENGINES, TRACKING_SOURCES } from "./contract";

export const sourceConfigurationSchema = z.object({
  provider: z.literal("dataforseo"),
  endpoint: z.string().min(1).max(256),
  engine: z.enum(TRACKING_ENGINES),
  source: z.enum(TRACKING_SOURCES),
  model: z.string().max(256).nullable(),
  parameters: z.record(z.string(), z.json()),
});
export const topicInputSchema = z.object({
  paused: z.boolean().optional(),
  name: z.string().trim().min(1).max(200),
  description: z.string().max(4000).nullable().optional(),
});
export const promptInputSchema = z.object({
  generationReference: z
    .object({
      generationId: z.string().refine((id) => isPublicIdOfType(id, "asg")),
      draftId: z.uuid(),
    })
    .strict()
    .optional(),
  providerDatasetReference: z
    .object({
      reportId: z.string().refine((id) => isPublicIdOfType(id, "agr")),
      rowIndex: z.number().int().min(0).max(9999),
    })
    .strict()
    .optional(),
  category: z.enum(PROMPT_CATEGORIES).optional(),
  paused: z.boolean().optional(),
  text: z
    .string()
    .min(1)
    .max(64000)
    .refine((text) => text.trim().length > 0, "Prompt must contain text."),
  topicId: z.string().nullable().optional(),
  label: z.string().max(200).nullable().optional(),
});
export const planTrackingRunSchema = z
  .object({
    actorId: z.string().min(1),
    actorCredential: z
      .object({
        id: z.string().min(1),
        kind: z.enum(["project_key", "personal_token", "oauth_client"]),
      })
      .optional(),
    idempotencyKey: z.string().min(1).max(200),
    promptIds: z.array(z.string().min(1)).max(100),
    configurations: z.array(sourceConfigurationSchema).min(1).max(20),
    credentialConnectionId: z.string().min(1),
    credentialVersion: z.string().min(1),
    budgetRevision: z.string().min(1),
    consentRevision: z.string().min(1),
    origin: z.enum(["manual", "scheduled"]),
    entrySource: z.enum(["app", "api", "mcp", "worker", "cli", "sdk"]),
    deadline: z.iso.datetime(),
    scheduleId: z.string().optional(),
    plannedAt: z.iso.datetime().optional(),
    retryOfRunId: z.string().optional(),
  })
  .refine(
    (value) => Boolean(value.scheduleId) === Boolean(value.plannedAt),
    "Schedule and occurrence must be provided together.",
  )
  .refine(
    (value) => value.origin === "scheduled" || value.promptIds.length > 0,
    "Manual runs require prompts.",
  );
export const scheduleInputSchema = z.object({
  name: z.string().trim().min(1).max(200),
  cron: z.string().min(1).max(200),
  timezone: z.string().min(1).max(100),
  enabled: z.boolean().optional(),
  configuration: planTrackingRunSchema,
  nextRunAt: z.iso.datetime().nullable().optional(),
});

export const scheduleSchema = scheduleInputSchema;

const citationSchema = z.object({
  url: z.string().max(8192),
  title: z.string().max(4096).nullable(),
  position: z.number().int().min(0),
});
export const persistTrackingResultSchema = z.object({
  attemptId: z.string().min(1),
  expectedDispatch: z.enum([
    "planned",
    "claimed",
    "submission_started",
    "submitted",
    "collecting",
    "submission_unknown",
    "terminal",
  ]),
  measurement: z.enum([
    "answer_present",
    "aio_not_present",
    "partial",
    "unavailable",
    "failed",
    "unknown",
  ]),
  evidence: z.object({
    answerText: z.string().nullable(),
    raw: z.json().nullable(),
    answerTruncated: z.boolean(),
    rawTruncated: z.boolean(),
    searchResults: z.array(citationSchema).max(100),
    requestedLocale: z.string().max(256).nullable(),
    effectiveLocale: z.string().max(256).nullable(),
    localeMechanism: z.string().max(256).nullable(),
    requestedModel: z.string().max(256).nullable(),
    actualModel: z.string().max(256).nullable(),
    providerStatus: z.string().max(1000).nullable(),
    observedAt: z.iso.datetime(),
    fetchedAt: z.iso.datetime(),
    recordedSource: z.enum(["fresh", "cache"]),
  }),
  citations: z.array(citationSchema).max(100),
  observations: z
    .array(
      z.object({
        entityKey: z.string().min(1).max(256),
        name: z.string().max(1024),
        competitorId: z.string().nullable(),
        mentioned: z.boolean(),
        position: z.number().int().min(0).nullable(),
        snippet: z.string().nullable().optional(),
        matchPolicy: z.string().max(100).optional(),
        confidence: z.number().min(0).max(1).nullable().optional(),
        aliases: z.array(z.string().max(1024)).max(100).optional(),
      }),
    )
    .max(100),
  receipt: z.object({
    providerCostEntryId: z.string().nullable(),
    amountUsd: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .nullable(),
    state: z.enum(["unknown", "pending", "confirmed", "refund_pending", "derived"]),
  }),
});
