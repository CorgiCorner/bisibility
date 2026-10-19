import type { SourceConfiguration } from "@/lib/ai-tracking/contract";
import { publicTrackingSchedule } from "@/lib/ai-tracking/projections/public";
import { canProjectAction } from "@/lib/auth/capabilities";
import { isProjectReadOnly } from "@/lib/deployment/project-write-mode";
import type { AiPrompt, AiTopic, AiTrackingSchedule } from "@/lib/generated/prisma/client";

/** Read model for AI schedules shown on the common Schedules page; never written back. */
export type TrackingScheduleListItem = {
  id: string;
  name: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  nextRunAt: string | null;
  archivedAt: string | null;
  promptIds: string[];
  configurations: SourceConfiguration[];
};

export type TrackingScheduleList = {
  canWrite: boolean;
  activePromptIds: string[];
  schedules: TrackingScheduleListItem[];
};

/** The single AI tracking write rule, shared by the AI workspace and the Schedules page. */
export function canWriteAiTracking(
  role: Parameters<typeof canProjectAction>[0],
  writeMode: unknown,
): boolean {
  return canProjectAction(role, "update", "project") && !isProjectReadOnly(writeMode);
}

export function trackingPromptStatus(
  prompt: Pick<AiPrompt, "archivedAt" | "pausedAt" | "topicId">,
  topics: readonly Pick<AiTopic, "id" | "pausedAt" | "archivedAt">[],
): "active" | "paused" | "archived" {
  if (prompt.archivedAt) return "archived";
  const topic = topics.find((item) => item.id === prompt.topicId);
  return prompt.pausedAt || topic?.pausedAt || topic?.archivedAt ? "paused" : "active";
}

export function trackingScheduleListItems(
  schedules: readonly AiTrackingSchedule[],
  prompts: readonly AiPrompt[],
  status: "current" | "archived",
): TrackingScheduleListItem[] {
  return schedules
    .filter((schedule) => (status === "archived") === Boolean(schedule.archivedAt))
    .map((schedule) => {
      const value = publicTrackingSchedule(schedule, prompts);
      return {
        id: value.id,
        name: value.name,
        cron: value.cron,
        timezone: value.timezone,
        enabled: value.enabled,
        nextRunAt: value.nextRunAt?.toISOString() ?? null,
        archivedAt: value.archivedAt?.toISOString() ?? null,
        promptIds: value.configuration.promptIds.filter((id): id is string => Boolean(id)),
        configurations: value.configuration.configurations,
      };
    });
}
