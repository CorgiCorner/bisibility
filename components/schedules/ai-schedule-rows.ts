import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";

/** Display-only AI schedule row. Never mapped back into either stored schedule model. */
export type AiScheduleListRow = {
  archivedAt: string | null;
  cron: string;
  enabled: boolean;
  name: string;
  nextRunAt: string | null;
  promptCount: number;
  publicId: string;
  timezone: string;
};

/** AI schedule data and callbacks supplied by the page; absent when AI tracking is unavailable. */
export type AiSchedulesController = {
  canWrite: boolean;
  activePromptCount: number;
  onArchive: (row: AiScheduleListRow) => Promise<void>;
  onPause: (row: AiScheduleListRow) => Promise<void>;
  rows: readonly AiScheduleListRow[];
};

export function toAiScheduleListRow(item: {
  archivedAt: string | null;
  cron: string;
  enabled: boolean;
  id: string;
  name: string;
  nextRunAt: string | null;
  promptIds: readonly string[];
  timezone: string;
}): AiScheduleListRow {
  return {
    archivedAt: item.archivedAt,
    cron: item.cron,
    enabled: item.enabled,
    name: item.name,
    nextRunAt: item.nextRunAt,
    promptCount: item.promptIds.length,
    publicId: item.id,
    timezone: item.timezone,
  };
}

/** Opens the AI schedule drawer on the common Schedules page; `new` creates a schedule. */
export function aiScheduleHref(projectRef: string, target: string) {
  return `${projectSchedulesPath(projectRef)}?ai=${encodeURIComponent(target)}`;
}
