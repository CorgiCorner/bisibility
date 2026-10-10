import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDisplayDateTime } from "@/lib/dates/format";
import type { ProjectRun } from "@/lib/runs/project-run";
import { projectRunTimelineAt, projectRunTimelineGroup } from "@/lib/runs/project-runs-timeline";
import { useTranslations } from "next-intl";
import { startedAt } from "./project-runs-table-copy";

export function RunTimelineTime({
  run,
  compact = false,
}: Readonly<{ run: ProjectRun; compact?: boolean }>) {
  const t = useTranslations("projectRuns.table");
  const timelineT = useTranslations("projectRuns.timeline");
  const dateDisplay = useDateDisplay();
  const group = projectRunTimelineGroup(run);
  const finished =
    run.kind === "rank_check" ? run.timestamps.finishedAt : run.timestamps.lastSyncFinishedAt;
  const label =
    group === 2
      ? finished
        ? timelineT("finishedAt")
        : t("submitted")
      : group === 0
        ? startedAt(run)
          ? t("started")
          : t("submitted")
        : run.kind === "rank_check" && ["planned", "blocked"].includes(run.details.status)
          ? timelineT("plannedFor")
          : run.kind === "rank_check" && run.details.trigger === "retry"
            ? timelineT("retryFrom")
            : timelineT("readyFrom");
  const formatted = formatDisplayDateTime(new Date(projectRunTimelineAt(run)), dateDisplay);
  if (compact)
    return (
      <time
        className="whitespace-nowrap text-[10px] tabular-nums text-fg-muted"
        dateTime={projectRunTimelineAt(run)}
        title={`${label}: ${formatted}`}
      >
        {formatted}
      </time>
    );
  return (
    <span className="grid gap-0.5">
      <span className="text-[10.5px] text-fg-muted">{label}</span>
      <span className="tabular-nums">{formatted}</span>
    </span>
  );
}
