import { parseCronExpression } from "@/lib/rank-check/cron";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import { newScheduleDefaults } from "@/lib/schedules/form-defaults";
import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import type { SerpDepth } from "@/lib/serp/constants";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

export const scheduleFrequencies = ["daily", "weekly", "monthly", "custom_cron"] as const;
export const scheduleEditorValidationCode = {
  invalidCron: "schedule_editor_invalid_cron",
  cronTooLong: "schedule_editor_cron_too_long",
  invalidTime: "schedule_editor_invalid_time",
  invalidTimeStep: "schedule_editor_invalid_time_step",
  name: "schedule_editor_name",
  nameTooLong: "schedule_editor_name_too_long",
} as const;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const timeOfDaySchema = z.string().superRefine((value, context) => {
  if (value === "") return;
  if (!timePattern.test(value)) {
    context.addIssue({ code: "custom", message: scheduleEditorValidationCode.invalidTime });
    return;
  }
  if (Number(value.slice(3)) % 30 !== 0) {
    context.addIssue({ code: "custom", message: scheduleEditorValidationCode.invalidTimeStep });
  }
});

export const scheduleEditorSchema = z
  .object({
    cronExpression: z.string().trim().max(120, scheduleEditorValidationCode.cronTooLong),
    dayOfMonth: z.enum(monthDays),
    frequency: z.enum(scheduleFrequencies),
    isDefault: z.boolean(),
    jitterMinutes: z.enum(["0", "15", "60"]),
    name: z
      .string()
      .trim()
      .min(1, scheduleEditorValidationCode.name)
      .max(80, scheduleEditorValidationCode.nameTooLong),
    providerPolicy: z.string().trim().min(1),
    serpDepth: z.union([
      z.literal("project"),
      z.coerce.number().pipe(serpDepthSchema).transform(String),
    ]),
    timeOfDay: timeOfDaySchema,
    timezone: z.string().max(80),
    weekday: z.enum(weekdays),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.frequency === "custom_cron" && !parseCronExpression(value.cronExpression).ok) {
      context.addIssue({
        code: "custom",
        message: scheduleEditorValidationCode.invalidCron,
        path: ["cronExpression"],
      });
    }
  });

export type ScheduleEditorValues = z.infer<typeof scheduleEditorSchema>;

const weekdayNameByNumber = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
] as const;

function onlyValue(field: ReadonlySet<number> | null) {
  return field?.size === 1 ? [...field][0] : null;
}

export type ScheduleEditorSchedule = {
  cronExpression: string | null;
  enabled: boolean;
  frequency: string;
  isDefault: boolean;
  jitterMinutes: number;
  keywordCount: number;
  name: string;
  providerPolicy: string | null;
  publicId: string;
  serpDepth: number | null;
  timeOfDay: string | null;
  timezone: string | null;
};

export type ScheduleEditorMember = {
  name: string;
  pending?: boolean;
  publicId: string;
  scheduleId?: string | null;
  sourceName?: string | null;
  targetCount: number;
};

export type ScheduleEditorCandidate = ScheduleEditorMember & {
  device: string;
  market: string;
  scheduleId: string | null;
  tags: readonly string[];
};

export type ScheduleEditorProvider = { label: string; value: string };

export type ScheduleEditorProjectDefaults = {
  provider: ScheduleEditorProvider | null;
  serpDepth: SerpDepth;
};

export type ScheduleEditorProps = {
  canEdit?: boolean;
  candidates?: readonly ScheduleEditorCandidate[];
  defaultScheduleName?: string | null;
  isNew?: boolean;
  members?: readonly ScheduleEditorMember[];
  memberSummary?: string;
  embedded?: boolean;
  onCancel?: () => void;
  onSaved?: (schedule: {
    publicId: string;
    name: string;
    frequency: string;
    isDefault: boolean;
  }) => void;
  pendingMembers?: readonly ScheduleEditorMember[];
  connectedProviders: readonly ScheduleEditorProvider[];
  projectId: string;
  projectDefaults: ScheduleEditorProjectDefaults;
  projectTimezone: string;
  referenceIso?: string;
  schedule: ScheduleEditorSchedule;
};

export const newEditorSchedule: ScheduleEditorSchedule = {
  ...newScheduleDefaults,
  cronExpression: null,
  enabled: true,
  isDefault: false,
  keywordCount: 0,
  providerPolicy: null,
  publicId: "new",
  serpDepth: null,
};

export function scheduleEditorDefaults(schedule: ScheduleEditorSchedule): ScheduleEditorValues {
  const frequency = scheduleFrequencies.includes(
    schedule.frequency as (typeof scheduleFrequencies)[number],
  )
    ? (schedule.frequency as ScheduleEditorValues["frequency"])
    : "daily";
  const parsedCron = schedule.cronExpression ? parseCronExpression(schedule.cronExpression) : null;
  const weekday =
    frequency === "weekly" && parsedCron?.ok
      ? (weekdayNameByNumber[onlyValue(parsedCron.weekday) ?? 1] ?? "Monday")
      : "Monday";
  const day = frequency === "monthly" && parsedCron?.ok ? (onlyValue(parsedCron.day) ?? 1) : 1;
  return {
    cronExpression: schedule.cronExpression ?? "0 6 * * 1-5",
    dayOfMonth: monthDays[Math.min(Math.max(day, 1), 28) - 1] ?? "1st",
    frequency,
    isDefault: schedule.isDefault,
    jitterMinutes: String(schedule.jitterMinutes) as ScheduleEditorValues["jitterMinutes"],
    name: schedule.name,
    providerPolicy: schedule.providerPolicy ?? "project",
    serpDepth: schedule.serpDepth ? String(schedule.serpDepth) : "project",
    timeOfDay: schedule.timeOfDay ?? "",
    timezone: schedule.timezone ?? "",
    weekday,
  };
}

export function cronPreview(
  expression: string,
  timezone: string,
  referenceIso = new Date().toISOString(),
) {
  if (!parseCronExpression(expression).ok) {
    return { detail: "invalidCron" as const, runs: null, timeZone: timezone };
  }

  try {
    const interval = CronExpressionParser.parse(expression, {
      currentDate: new Date(referenceIso),
      tz: timezone,
    });
    const runs = [
      new Date(interval.next().getTime()),
      new Date(interval.next().getTime()),
      new Date(interval.next().getTime()),
    ];
    return {
      detail: expression === "0 6 * * 1-5" ? ("everyWeekday" as const) : ("custom" as const),
      runs: runs.map((run) => run.toISOString()),
      timeZone: timezone,
    };
  } catch {
    return { detail: "invalidTimeZone" as const, runs: null, timeZone: timezone };
  }
}

export type MoveSummaryLabels = {
  combine: (scheduled: string, manual: string) => string;
  manual: (count: number) => string;
  scheduled: (count: number) => string;
  summary: (summary: string, scheduleName: string) => string;
};

export function moveSummary(
  members: readonly ScheduleEditorMember[],
  scheduleName: string,
  labels: MoveSummaryLabels,
) {
  const scheduled = members.filter((member) => member.sourceName).length;
  const manual = members.length - scheduled;
  const scheduledSummary = scheduled ? labels.scheduled(scheduled) : null;
  const manualSummary = manual ? labels.manual(manual) : null;
  const summary =
    scheduledSummary && manualSummary
      ? labels.combine(scheduledSummary, manualSummary)
      : (scheduledSummary ?? manualSummary);
  return summary ? labels.summary(summary, scheduleName) : null;
}
