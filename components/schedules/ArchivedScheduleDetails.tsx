import { RunsTable } from "@/components/rank-runs/RunsTable";
import type { RankRunRecord } from "@/components/rank-runs/runs-types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { PillBadge } from "@/components/ui/Pill";
import { projectSchedulesPath } from "@/lib/routing/project-schedules-path";
import type { ScheduleEditorSchedule } from "./ScheduleEditorModel";
import { RestoreScheduleButton } from "./ScheduleLifecycleActions";

export function ArchivedScheduleDetails({
  canManage,
  history,
  nextCursor,
  projectId,
  projectTimezone,
  projectDepth,
  providerLabel,
  schedule,
}: Readonly<{
  canManage: boolean;
  history: readonly RankRunRecord[];
  nextCursor: string | null;
  projectId: string;
  projectTimezone: string;
  projectDepth: number;
  providerLabel: string;
  schedule: ScheduleEditorSchedule;
}>) {
  return (
    <div className="grid gap-4">
      <Card size="sm">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <PillBadge size="xs">Archived</PillBadge>
          {canManage ? (
            <RestoreScheduleButton projectId={projectId} scheduleId={schedule.publicId} />
          ) : null}
        </div>
        <p className="my-4 text-sm text-fg-muted">
          This schedule no longer runs or accepts keywords. Restore it as paused to use it again.
        </p>
        <dl className="m-0 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <dt className="text-fg-muted">Time zone</dt>
            <dd className="m-0 mt-1">
              {schedule.timezone ?? `Project default (${projectTimezone})`}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">SERP depth</dt>
            <dd className="m-0 mt-1">
              {schedule.serpDepth
                ? `Top ${schedule.serpDepth}`
                : `Project default (Top ${projectDepth})`}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Start window</dt>
            <dd className="m-0 mt-1">
              {schedule.timeOfDay
                ? `Within ${schedule.jitterMinutes} min of ${schedule.timeOfDay}`
                : "Spread across the interval"}
            </dd>
          </div>
          <div>
            <dt className="text-fg-muted">Provider</dt>
            <dd className="m-0 mt-1">{providerLabel}</dd>
          </div>
        </dl>
      </Card>
      <Card className="min-w-0 overflow-hidden p-0" size="sm">
        <h2 className="m-0 border-b border-border px-4 py-3 text-base font-semibold">
          Run history
        </h2>
        {history.length ? (
          <RunsTable
            rows={history}
            projectRef={projectId}
            emptyActionHref={projectSchedulesPath(projectId)}
          />
        ) : (
          <p className="m-0 p-6 text-sm text-fg-muted">No runs recorded for this schedule.</p>
        )}
        {nextCursor ? (
          <div className="border-t border-border p-4">
            <Button
              size="sm"
              variant="secondary"
              href={`${projectSchedulesPath(projectId, schedule.publicId)}?cursor=${encodeURIComponent(nextCursor)}`}
            >
              Older runs
            </Button>
          </div>
        ) : null}
      </Card>
    </div>
  );
}
