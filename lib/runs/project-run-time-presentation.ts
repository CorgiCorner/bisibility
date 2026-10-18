import { isPlannedProjectRun, type ProjectRun } from "./project-run";
import { projectRunTimelineAt, projectRunTimelineGroup } from "./project-runs-timeline";

export type RunTimelineSection = "active" | "due" | "later" | "waiting" | "history";

function instant(value: string | null | undefined) {
  const parsed = value ? Date.parse(value) : Number.NaN;
  return Number.isFinite(parsed) ? parsed : null;
}

/** Presentation only: the server's sort instant keeps each waiting subsection contiguous. */
export function runTimelineSection(run: ProjectRun, readAt?: string): RunTimelineSection {
  const group = projectRunTimelineGroup(run);
  if (group === 0) return "active";
  if (group === 2) return "history";
  const now = instant(readAt);
  const at = instant(projectRunTimelineAt(run));
  return now === null || at === null ? "waiting" : at < now ? "due" : "later";
}

/** Null means there is no evidence for an unstarted occurrence past its scheduled time. */
export function pastScheduledDays(run: ProjectRun, readAt?: string): number | null {
  if (!isPlannedProjectRun(run) || run.timestamps.startedAt) return null;
  const now = instant(readAt);
  const planned = instant(run.timestamps.plannedFor);
  return now !== null && planned !== null && planned < now
    ? Math.floor((now - planned) / 86_400_000)
    : null;
}
