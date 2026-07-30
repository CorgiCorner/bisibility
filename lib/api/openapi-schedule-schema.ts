import { JITTER_MINUTES_MAX, JITTER_MINUTES_MIN } from "@/lib/schemas/keyword";

export const jitterMinutesContractSchema = {
  description: `Whole-minute random delay from ${JITTER_MINUTES_MIN} to ${JITTER_MINUTES_MAX}. Set 0 to disable jitter.`,
  maximum: JITTER_MINUTES_MAX,
  minimum: JITTER_MINUTES_MIN,
  type: "integer",
} as const;

export const scheduleTimezoneContractSchema = {
  description:
    "IANA time zone that anchors monthly and custom cron wall-clock schedules. Daily and weekly use a stable keyword-specific interval phase that timezone does not move.",
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
