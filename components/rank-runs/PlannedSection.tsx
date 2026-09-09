import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import { StatusChip } from "@/components/ui/StatusChip";
import { runStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { useBrowserTimeZone } from "@/components/ui/ZonedTime";
import { formatDateTime } from "@/lib/dates/format";
import { pluralize } from "@/lib/format/pluralize";
import { formatPlannedDay, plannedRunDayKey } from "./runs-format";
import type { RankRunRecord } from "./runs-types";

type PlannedSectionProps = {
  budgetExhausted: boolean;
  budgetSettingsHref?: string;
  onRunNow: (run: RankRunRecord) => void;
  onSkip: (run: RankRunRecord) => void;
  pendingRunId: string | null;
  runs: readonly RankRunRecord[];
};

type PlannedDay = {
  label: string;
  runs: RankRunRecord[];
};

function plannedDays(
  runs: readonly RankRunRecord[],
  dateFormat: ReturnType<typeof useDateFormat>,
  timeZone: string,
): PlannedDay[] {
  const groups = new Map<string, RankRunRecord[]>();
  for (const run of runs) {
    const key = plannedRunDayKey(run.plannedFor, timeZone);
    groups.set(key, [...(groups.get(key) ?? []), run]);
  }
  return [...groups.values()].map((dayRuns) => {
    return {
      label: formatPlannedDay(dayRuns[0]?.plannedFor ?? null, dateFormat, timeZone),
      runs: dayRuns,
    };
  });
}

function time(
  value: string | null,
  dateFormat: ReturnType<typeof useDateFormat>,
  timeZone: string,
) {
  if (!value) return "-";
  return formatDateTime(new Date(value), dateFormat, timeZone).split(", ").at(-1) ?? "-";
}

export function PlannedSection({
  budgetExhausted,
  budgetSettingsHref,
  onRunNow,
  onSkip,
  pendingRunId,
  runs,
}: Readonly<PlannedSectionProps>) {
  const dateFormat = useDateFormat();
  const timeZone = useBrowserTimeZone() ?? "UTC";
  const days = plannedDays(runs, dateFormat, timeZone);

  if (days.length === 0) return null;

  return (
    <div className="min-w-0">
      <div className="overflow-x-auto border-t border-border">
        <div className="min-w-[480px] [&>div:last-child>*:last-child]:border-b-0">
          {days.map((day) => (
            <div key={day.label}>
              <div
                className="grid grid-cols-[80px_minmax(0,1fr)_200px] items-center gap-3 border-b border-border px-4 py-2.5"
                data-planned-day
              >
                <span className="col-span-2 text-[12.5px] font-semibold text-fg">
                  {day.label}
                  <span className="ml-2 text-[11px] font-normal text-fg-muted">
                    {day.runs.length} {day.runs.length === 1 ? "run" : "runs"}
                  </span>
                </span>
              </div>
              {day.runs.map((run) => {
                const blocked = run.status === "blocked" && budgetExhausted;
                const presentation = runStatusChipPresentation(run.status, run.outcome);
                const pending = pendingRunId === run.id;
                return (
                  <div
                    className={
                      blocked
                        ? "grid grid-cols-[80px_minmax(0,1fr)_200px] items-center gap-3 border-b border-yellow/35 bg-yellow/10 px-4 py-3 text-fg"
                        : "grid grid-cols-[80px_minmax(0,1fr)_200px] items-center gap-3 border-b border-border px-4 py-3"
                    }
                    data-planned-row={run.id}
                    data-testid={`planned-row-${run.id}`}
                    key={run.id}
                  >
                    <span className="text-[11.5px] tabular-nums text-fg-muted">
                      {time(run.plannedFor, dateFormat, timeZone)}
                    </span>
                    <span className="min-w-0">
                      <span className="flex flex-wrap items-center gap-2">
                        <span className="text-[12.5px] font-semibold text-fg">
                          {run.checkSchedulePublicId ? "Scheduled" : "Planned"}
                        </span>
                        {blocked ? <StatusChip {...presentation} /> : null}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-fg-muted">
                        {pluralize(run.keywordCount, "keyword")} /{" "}
                        {pluralize(run.targetCount, "target")}
                      </span>
                      {blocked ? (
                        <span className="mt-1 block text-[11.5px] text-fg">
                          Targets are paused because the budget was reached.
                        </span>
                      ) : null}
                    </span>
                    <span className="flex justify-end gap-1.5">
                      {blocked ? (
                        <Button href={budgetSettingsHref} size="xs" variant="secondary">
                          Edit budget
                        </Button>
                      ) : (
                        <>
                          <Button
                            disabled={pending}
                            loading={pending}
                            loadingLabel="Running"
                            onClick={() => onRunNow(run)}
                            size="xs"
                            variant="ghost"
                          >
                            Run now
                          </Button>
                          <Button
                            disabled={pending}
                            onClick={() => onSkip(run)}
                            size="xs"
                            variant="ghost"
                          >
                            Skip once
                          </Button>
                        </>
                      )}
                    </span>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
