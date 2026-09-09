import { parseCronExpression, zonedCronParts } from "@/lib/rank-check/cron";
import { monthDays, weekdays } from "@/lib/rank-check/schedule-calendar";
import { newScheduleDefaults } from "@/lib/schedules/form-defaults";
import { serpDepthSchema } from "@/lib/schemas/serp-depth";
import { type SerpDepth, serpDepthValues } from "@/lib/serp/constants";
import { CronExpressionParser } from "cron-parser";
import { z } from "zod";

export const scheduleFrequencies = ["daily", "weekly", "monthly", "custom_cron"] as const;
const timePattern = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
const timeOfDaySchema = z.string().superRefine((value, context) => {
  if (value === "") return;
  if (!timePattern.test(value)) {
    context.addIssue({ code: "custom", message: "Enter a time in HH:mm format." });
    return;
  }
  if (Number(value.slice(3)) % 30 !== 0) {
    context.addIssue({ code: "custom", message: "Enter a time in 30-minute steps." });
  }
});

export const scheduleEditorSchema = z
  .object({
    cronExpression: z.string().trim().max(120),
    dayOfMonth: z.enum(monthDays),
    frequency: z.enum(scheduleFrequencies),
    isDefault: z.boolean(),
    jitterMinutes: z.enum(["0", "15", "60"]),
    name: z.string().trim().min(1, "Enter a schedule name.").max(80),
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
        message: "Enter a valid five-field cron expression.",
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

export const scheduleOverrideHelp =
  "Project default follows the project settings. Always pins this schedule.";

export function scheduleOverrideOptions(
  projectDefaultLabel: string | null,
  overrides: readonly ScheduleEditorProvider[],
) {
  return [
    {
      label: projectDefaultLabel ? `Project default (${projectDefaultLabel})` : "Project default",
      value: "project",
    },
    ...overrides.map(({ label, value }) => ({ label: `Always ${label}`, value })),
  ];
}

export type ScheduleEditorProps = {
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

function timeLabel(date: Date, timezone: string) {
  const parts = zonedCronParts(date, timezone);
  const days = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  return `${days[parts.weekday]} ${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

export function cronPreview(
  expression: string,
  timezone: string,
  referenceIso = new Date().toISOString(),
) {
  if (!parseCronExpression(expression).ok) {
    return { detail: "Enter a valid five-field cron expression.", next: null };
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
      detail: expression === "0 6 * * 1-5" ? "Every weekday at 06:00." : "Custom cron schedule.",
      next: `Next three: ${runs.map((run) => timeLabel(run, timezone)).join(", ")} ${timezone}.`,
    };
  } catch {
    return { detail: "Enter a valid time zone.", next: null };
  }
}

export function defaultScheduleNote(defaultScheduleName: string | null | undefined) {
  return defaultScheduleName
    ? `Replaces ${defaultScheduleName} for new keywords. Existing keywords keep their schedules.`
    : "Enable to use this schedule for new keywords. Existing keywords keep their schedules.";
}

export function scheduleDepthOptions(projectDepth: SerpDepth) {
  return scheduleOverrideOptions(
    `Top ${projectDepth}`,
    serpDepthValues.map((depth) => ({ label: `Top ${depth}`, value: String(depth) })),
  );
}

export function moveSummary(members: readonly ScheduleEditorMember[], scheduleName: string) {
  const scheduled = members.filter((member) => member.sourceName).length;
  const manual = members.length - scheduled;
  const parts: string[] = [];
  if (scheduled) {
    parts.push(`${scheduled} ${scheduled === 1 ? "keyword" : "keywords"} from other schedules`);
  }
  if (manual) {
    parts.push(`${manual} ${manual === 1 ? "keyword" : "keywords"} from manual`);
  }
  return parts.length ? `Saving moves ${parts.join(" and ")} into ${scheduleName}.` : null;
}
