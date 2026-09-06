import { isPublicIdOfType } from "@/lib/db/public-id";
import { PROVIDER_CATALOG } from "@/lib/providers/registry";
import { parseCronExpression } from "@/lib/rank-check/cron";
import { isSupportedProjectTimezone } from "@/lib/settings/timezones";
import { z } from "zod";
import {
  JITTER_MINUTES_MAX,
  JITTER_MINUTES_MIN,
  JITTER_MINUTES_RANGE_MESSAGE,
  keywordScheduleBaseSchema,
  keywordScheduleSchema,
} from "./keyword";
import { serpDepthSchema } from "./serp-depth";

const projectIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "prj"), "Project not found.");
const scheduleIdSchema = z
  .string()
  .refine((value) => isPublicIdOfType(value, "sch"), "Check schedule not found.");
const scheduleProviderIds: ReadonlySet<string> = new Set(
  PROVIDER_CATALOG.filter((provider) => provider.kind === "serp").map((provider) => provider.id),
);
const providerPolicySchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .min(1)
    .refine(
      (value) => value === "project" || scheduleProviderIds.has(value),
      "Select a valid SERP provider or the project default.",
    )
    .nullable()
    .optional(),
);
const timezoneSchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .trim()
    .min(1)
    .max(80)
    .refine(isSupportedProjectTimezone, "Select a valid time zone.")
    .nullable()
    .optional(),
);
const timeOfDaySchema = z.preprocess(
  (value) => (value === "" ? null : value),
  z
    .string()
    .superRefine((value, context) => {
      if (!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value)) {
        context.addIssue({ code: "custom", message: "Enter a time in HH:mm format." });
        return;
      }
      if (Number(value.slice(3)) % 30 !== 0) {
        context.addIssue({ code: "custom", message: "Enter a time in 30-minute steps." });
      }
    })
    .nullable()
    .optional(),
);

const cadenceFields = {
  cronExpression: keywordScheduleBaseSchema.shape.cronExpression,
  frequency: keywordScheduleBaseSchema.shape.frequency,
  jitterMinutes: z.coerce
    .number()
    .int(JITTER_MINUTES_RANGE_MESSAGE)
    .min(JITTER_MINUTES_MIN, JITTER_MINUTES_RANGE_MESSAGE)
    .max(JITTER_MINUTES_MAX, JITTER_MINUTES_RANGE_MESSAGE)
    .default(60),
  timezone: timezoneSchema,
};

function requireCustomCron(
  value: {
    cronExpression?: string | null;
    frequency?: string;
    jitterMinutes?: number;
    timezone?: string | null;
  },
  ctx: z.RefinementCtx,
) {
  if (!value.frequency) return;
  const parsed = keywordScheduleSchema.safeParse({
    cronExpression: value.cronExpression,
    frequency: value.frequency,
    jitterMinutes: value.jitterMinutes,
    timezone: value.timezone ?? "UTC",
  });
  if (!parsed.success) {
    for (const issue of parsed.error.issues) {
      ctx.addIssue({ ...issue, path: issue.path });
    }
  }
}

function requireCalendarCron(
  value: { cronExpression?: string | null; frequency?: string },
  ctx: z.RefinementCtx,
) {
  if (value.frequency !== "weekly" && value.frequency !== "monthly") return;
  if (!value.cronExpression || !parseCronExpression(value.cronExpression).ok) {
    ctx.addIssue({
      code: "custom",
      message: "Weekly and monthly schedules require a valid cron expression.",
      path: ["cronExpression"],
    });
  }
}

const scheduleFields = {
  ...cadenceFields,
  name: z.string().trim().min(1).max(80),
  providerPolicy: providerPolicySchema,
  serpDepth: serpDepthSchema.nullable().optional(),
  timeOfDay: timeOfDaySchema,
};

export const createCheckScheduleSchema = z
  .object({ ...scheduleFields, projectId: projectIdSchema })
  .strict()
  .superRefine(requireCustomCron)
  .superRefine(requireCalendarCron);

export const updateCheckScheduleSchema = z
  .object({
    cronExpression: cadenceFields.cronExpression.optional(),
    enabled: z.boolean().optional(),
    frequency: cadenceFields.frequency.optional(),
    jitterMinutes: z.coerce
      .number()
      .int(JITTER_MINUTES_RANGE_MESSAGE)
      .min(JITTER_MINUTES_MIN, JITTER_MINUTES_RANGE_MESSAGE)
      .max(JITTER_MINUTES_MAX, JITTER_MINUTES_RANGE_MESSAGE)
      .optional(),
    name: scheduleFields.name.optional(),
    projectId: projectIdSchema,
    providerPolicy: scheduleFields.providerPolicy,
    scheduleId: scheduleIdSchema,
    serpDepth: scheduleFields.serpDepth,
    timeOfDay: scheduleFields.timeOfDay,
    timezone: cadenceFields.timezone,
  })
  .strict()
  .superRefine(requireCustomCron)
  .superRefine(requireCalendarCron);

const scheduleTargetSchema = z
  .object({
    projectId: projectIdSchema,
    scheduleId: scheduleIdSchema,
  })
  .strict();

export const setDefaultCheckScheduleSchema = scheduleTargetSchema;
export const deleteCheckScheduleSchema = scheduleTargetSchema;

export const checkScheduleMembershipSchema = scheduleTargetSchema.extend({
  keywordIds: z
    .array(z.string().refine((value) => isPublicIdOfType(value, "kw"), "Keyword not found."))
    .min(1)
    .max(500),
});

export type CreateCheckScheduleInput = z.infer<typeof createCheckScheduleSchema>;
export type UpdateCheckScheduleInput = z.infer<typeof updateCheckScheduleSchema>;
export type CheckScheduleMembershipInput = z.infer<typeof checkScheduleMembershipSchema>;
