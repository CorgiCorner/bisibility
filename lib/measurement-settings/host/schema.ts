import { isPublicIdOfType } from "@/lib/db/public-id-resources";
import { measurementSelectionSchema, scheduleDraftSchema } from "@/lib/measurement-settings/schema";
import { z } from "zod";

const publicProject = z.string().refine((value) => isPublicIdOfType(value, "prj"));
const publicSchedule = z.string().refine((value) => isPublicIdOfType(value, "sch"));
const scheduleId = publicSchedule.nullable();
const hash = z.string().regex(/^[a-f0-9]{64}$/u);
const revision = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const spec = z.object({ kind: z.literal("all"), v: z.literal(1) }).strict();
export const hostPreviewSchema = z
  .object({
    projectId: publicProject,
    spec,
    expectedRevision: revision,
    expectedSourceHash: hash,
    selection: measurementSelectionSchema,
    scheduleId,
    schedule: scheduleDraftSchema.nullable(),
  })
  .strict();
const key = z.string().trim().min(8).max(128);
const token = z.string().min(1).max(8192);
export const hostLaunchSchema = z
  .object({
    projectId: publicProject,
    spec,
    expectedRevision: revision,
    expectedSourceHash: hash,
    scheduleId,
    intent: measurementSelectionSchema,
    capabilityVersion: z.string().min(1).max(128),
    confirmed: z.literal(true),
    idempotencyKey: key,
    previewToken: token,
    measurementToken: token,
    depth: z.number().int().positive(),
    providerId: z.string().min(1).max(120),
  })
  .strict();
export const hostScheduleSchema = z
  .object({
    projectId: publicProject,
    expectedRevision: revision,
    expectedSourceHash: hash,
    selection: measurementSelectionSchema,
    scheduleId: publicSchedule,
    schedule: scheduleDraftSchema,
    confirmed: z.literal(true),
    idempotencyKey: key,
    previewToken: token,
  })
  .strict();
export const hostIntentSchema = z
  .object({
    projectId: publicProject,
    expectedRevision: revision,
    expectedSourceHash: hash,
    scheduleId,
    selection: measurementSelectionSchema.pick({
      geoId: true,
      languageCode: true,
      device: true,
      depth: true,
    }),
    confirmed: z.literal(true),
    idempotencyKey: key,
    previewToken: token,
  })
  .strict();
export const settingsSnapshotSchema = z
  .object({
    revision,
    sourceHash: hash,
    scheduleId,
    defaultIntent: measurementSelectionSchema.pick({
      geoId: true,
      languageCode: true,
      device: true,
      depth: true,
    }),
    selection: measurementSelectionSchema,
    schedule: scheduleDraftSchema.nullable(),
    scopeSources: z
      .object({
        geo: z.enum(["project", "schedule", "keyword", "explicit", "unknown"]),
        language: z.enum(["project", "schedule", "keyword", "explicit", "unknown"]),
        device: z.enum(["project", "schedule", "keyword", "explicit", "unknown"]),
        surface: z.enum(["project", "schedule", "keyword", "explicit", "unknown"]),
        depth: z.enum(["project", "schedule", "keyword", "explicit", "unknown"]),
        provider: z.enum(["project", "schedule", "keyword", "explicit", "unknown"]),
      })
      .strict()
      .optional(),
    nextRun: z
      .object({
        at: z.string().datetime().nullable(),
        timezone: z.string(),
        basis: z.enum(["captured_calendar", "unavailable"]),
      })
      .strict()
      .optional(),
  })
  .strict();
