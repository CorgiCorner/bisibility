import { useTranslations } from "next-intl";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";
import { progressFor, scopeLabelFor, titleFor } from "./project-runs-table-copy";
import { RunStatusChip } from "./RunStatusChip";
import { RunTimelineTime } from "./RunTimelineTime";
import { useRunStatusCopy } from "./run-status-copy";

export function RunTitleCell({
  run,
  compact,
}: Readonly<{ run: ProjectRunWithOperationSnapshot; compact: boolean }>) {
  const t = useTranslations("projectRuns.table");
  const timelineT = useTranslations("projectRuns.timeline");
  const copy = useRunStatusCopy();
  return (
    <span className="grid min-w-0 gap-1">
      <span className="block truncate font-medium text-fg" title={titleFor(run, t)}>
        {titleFor(run, t)}
      </span>
      {compact ? (
        <>
          <span className="flex min-w-0 items-center gap-2">
            <RunStatusChip {...copy.forRun(run)} />
            <RunTimelineTime run={run} compact />
          </span>
          {run.kind === "rank_check" && run.details.blockedReason === "no_active_keywords" ? (
            <span className="text-[10.5px] text-fg-muted">{timelineT("noActiveKeywords")}</span>
          ) : (
            <span className="flex items-center gap-2 text-[10.5px] text-fg-muted">
              <span>{scopeLabelFor(run, t)}</span>
              <span className="tabular-nums">{progressFor(run, t)}</span>
            </span>
          )}
        </>
      ) : null}
    </span>
  );
}
