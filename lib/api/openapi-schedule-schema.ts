import { JITTER_MINUTES_MAX, JITTER_MINUTES_MIN } from "@/lib/schemas/keyword";
import { openEnum, sdkName } from "./openapi-sdk-schema";

export const jitterMinutesContractSchema = {
  description: `Whole-minute random delay from ${JITTER_MINUTES_MIN} to ${JITTER_MINUTES_MAX}. Set 0 to disable jitter.`,
  maximum: JITTER_MINUTES_MAX,
  minimum: JITTER_MINUTES_MIN,
  type: "integer",
} as const;

export const scheduleTimezoneContractSchema = {
  description:
    "IANA time zone for the selected cadence. Schedules without a fixed time use stable keyword slots within each occurrence.",
  type: "string",
} as const;

export const scheduleInputContractSchema = {
  properties: {
    cron_expression: { type: ["string", "null"] },
    frequency: {
      enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
      type: "string",
    },
    jitter_minutes: { ...jitterMinutesContractSchema, default: 60 },
    timezone: { ...scheduleTimezoneContractSchema, default: "UTC" },
  },
  required: ["frequency"],
  type: "object",
} as const;

/** The schedule a keyword resource reports, with the source of its values. */
export const keywordScheduleResourceContractSchema = {
  properties: {
    cron_expression: { type: ["string", "null"] },
    frequency: {
      enum: ["paused", "manual", "daily", "weekly", "monthly", "custom_cron"],
      type: "string",
      ...openEnum("ScheduleFrequency"),
    },
    jitter_minutes: jitterMinutesContractSchema,
    last_checked_at: { format: "date-time", type: ["string", "null"] },
    next_check_at: { format: "date-time", type: ["string", "null"] },
    source: {
      description:
        "The keyword's actual project-schedule membership. Unassigned or archived membership reports manual and no next check; disabled membership reports paused. keyword remains the compatibility source value; project_default is retained in the enum for older clients.",
      enum: ["keyword", "project_default"],
      type: "string",
      ...openEnum("ScheduleSource"),
    },
    timezone: scheduleTimezoneContractSchema,
  },
  required: [
    "frequency",
    "cron_expression",
    "timezone",
    "jitter_minutes",
    "last_checked_at",
    "next_check_at",
    "source",
  ],
  type: ["object", "null"],
  ...sdkName("KeywordSchedule"),
};
