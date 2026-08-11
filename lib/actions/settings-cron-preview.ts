"use server";

import { normalizeSchedule } from "@/lib/actions/_schedule";
import { requireReadableProject } from "@/lib/queries/_auth";
import { nextThreeCronRuns } from "@/lib/rank-check/dispatcher-recurrence";
import { isSupportedTimezone } from "@/lib/settings/timezones";
import { z } from "zod";

const cronPreviewSchema = z.object({
  cronExpression: z.string().trim().min(1).max(120),
  projectId: z.string().trim().min(1).max(120),
  timezone: z.string().trim().min(1).max(80).refine(isSupportedTimezone),
});

export type CronPreviewResult = {
  message: string;
  runs: string[];
  status: "idle" | "invalid" | "ready";
};

function runLabel(run: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    day: "numeric",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "short",
    timeZone: timezone,
  }).formatToParts(run);
  const value = (type: string) => parts.find((part) => part.type === type)?.value;
  return `${value("month")} ${value("day")}, ${value("hour")}:${value("minute")}`;
}

function safePreviewError(error: unknown) {
  return error instanceof Error && error.message.includes("at least one hour apart")
    ? error.message
    : "Enter a valid five-field cron expression.";
}

export async function previewProjectCronRuns(input: unknown): Promise<CronPreviewResult> {
  const data = cronPreviewSchema.parse(input);
  await requireReadableProject(data.projectId);
  const from = new Date();

  try {
    normalizeSchedule(
      {
        cronExpression: data.cronExpression,
        frequency: "custom_cron",
        jitterMinutes: 60,
        timezone: data.timezone,
      },
      from,
    );
    const runs = nextThreeCronRuns({
      cronExpression: data.cronExpression,
      from,
      timezone: data.timezone,
    });
    return {
      message: "Each keyword is scheduled at or after an anchor using deterministic jitter.",
      runs: runs.map((run) => runLabel(run, data.timezone)),
      status: "ready",
    };
  } catch (error: unknown) {
    return { message: safePreviewError(error), runs: [], status: "invalid" };
  }
}
