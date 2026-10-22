import { Button } from "@/components/ui/Button";
import { IdChip, shortId } from "@/components/ui/IdChip";
import { projectRunTimelineGroup } from "@/lib/runs/project-runs-timeline";
import { useTranslations } from "next-intl";
import type { ProjectRunWithOperationSnapshot } from "./project-runs-presentation";
import { scopeLabelFor, titleFor } from "./project-runs-table-copy";
import { RunCost } from "./RunCost";
import { RunStatusChip } from "./RunStatusChip";
import { RunStatusSummary } from "./RunStatusSummary";
import { RunTimelineTime } from "./RunTimelineTime";
import { useRunStatusCopy } from "./run-status-copy";

export function RunTitleCell({
  run,
  compact,
  readAt,
}: Readonly<{ run: ProjectRunWithOperationSnapshot; compact: boolean; readAt?: string }>) {
  const t = useTranslations("projectRuns.table");
  const copy = useRunStatusCopy();
  return (
    <span className="grid min-w-0 gap-1">
      <span className="block truncate font-medium text-fg" title={titleFor(run, t)}>
        {titleFor(run, t)}
      </span>
      <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-fg-muted">
        <span className="truncate" title={run.scope.description ?? run.project.name}>
          {run.scope.description ?? scopeLabelFor(run, t)}
        </span>
        {compact ? (
          <span className="font-mono" title={run.id}>
            {shortId(run.id, "middle")}
          </span>
        ) : (
          <IdChip value={run.id} size="xs" truncate="middle" />
        )}
      </span>
      {projectRunTimelineGroup(run) === 2 || run.timestamps.startedAt ? (
        <RunCost cost={run.cost} />
      ) : null}
      {compact ? (
        <>
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <RunStatusChip {...copy.forRun(run)} />
            <RunTimelineTime run={run} compact readAt={readAt} />
          </span>
          <RunStatusSummary run={run} />
          {run.attention && projectRunTimelineGroup(run) !== 2 ? (
            <span>
              <Button
                href={run.href}
                onClick={(event) => event.stopPropagation()}
                onKeyDown={(event) => event.stopPropagation()}
                size="xs"
                variant="secondary"
              >
                {t("reviewIssue")}
              </Button>
            </span>
          ) : null}
        </>
      ) : null}
    </span>
  );
}
