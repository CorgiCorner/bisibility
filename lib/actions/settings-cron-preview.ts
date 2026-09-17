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
  message: "anchors_too_close" | "invalid_expression" | "ready" | null;
  runs: string[];
  status: "idle" | "invalid" | "ready";
  timezone: string | null;
};

function safePreviewError(error: unknown) {
  return error instanceof Error && error.message.includes("at least one hour apart")
    ? "anchors_too_close"
    : "invalid_expression";
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
      message: "ready",
      runs: runs.map((run) => run.toISOString()),
      status: "ready",
      timezone: data.timezone,
    };
  } catch (error: unknown) {
    return { message: safePreviewError(error), runs: [], status: "invalid", timezone: null };
  }
}
