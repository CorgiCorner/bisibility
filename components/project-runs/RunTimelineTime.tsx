import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type { ProjectRun } from "@/lib/runs/project-run";
import { pastScheduledDays } from "@/lib/runs/project-run-time-presentation";
import { projectRunTimelineAt, projectRunTimelineGroup } from "@/lib/runs/project-runs-timeline";
import { useTranslations } from "next-intl";
import { startedAt } from "./project-runs-table-copy";

export function RunTimelineTime({
  run,
  compact = false,
  readAt,
}: Readonly<{ run: ProjectRun; compact?: boolean; readAt?: string }>) {
  const t = useTranslations("projectRuns.table");
  const timelineT = useTranslations("projectRuns.timeline");
  const dateDisplay = useDateDisplay();
  const group = projectRunTimelineGroup(run);
  const pastDays = pastScheduledDays(run, readAt);
  const finished = run.timestamps.finishedAt;
  const label =
    pastDays !== null
      ? timelineT("pastScheduled")
      : group === 2
        ? finished
          ? timelineT("finishedAt")
          : t("submitted")
        : group === 0
          ? startedAt(run)
            ? t("started")
            : t("submitted")
          : run.kind === "rank" && ["planned", "blocked"].includes(run.details.status)
            ? timelineT("plannedFor")
            : run.kind === "rank" && run.details.trigger === "retry"
              ? timelineT("retryFrom")
              : timelineT("readyFrom");
  const formatted = formatDisplayDateTime(new Date(projectRunTimelineAt(run)), dateDisplay);
  const overdue =
    pastDays !== null
      ? pastDays > 0
        ? timelineT("pastScheduledDays", { count: pastDays })
        : timelineT("pastScheduled")
      : null;
  if (compact)
    return (
      <time
        className="grid min-w-0 gap-0.5 text-[11px] tabular-nums text-fg-muted"
        dateTime={projectRunTimelineAt(run)}
        title={`${label}: ${formatted}`}
      >
        {overdue ? <span>{overdue}</span> : null}
        <span>{formatted}</span>
      </time>
    );
  return (
    <span className="grid gap-0.5">
      <span className="text-[10.5px] text-fg-muted">{overdue ?? label}</span>
      <span className="tabular-nums">{formatted}</span>
    </span>
  );
}
