import { StatusPill } from "@/components/ui";
import { scheduleCadenceLabel } from "@/lib/schedules/cadence-label";
import type { CheckScheduleSummary, ScheduleChoice } from "./set-schedule-model";

type SetScheduleModalChoicesProps = {
  choice: ScheduleChoice;
  currentSchedule: CheckScheduleSummary | null;
  currentScheduleId: string | null;
  loadError?: string | null;
  loading?: boolean;
  monthlyDelta: (schedule: CheckScheduleSummary | null) => string;
  onChoose: (choice: ScheduleChoice) => void;
  onOpenNewSchedule: () => void;
  schedules: readonly CheckScheduleSummary[];
  selectedCount: number;
};

function targetLabel(count: number) {
  return `${count} target${count === 1 ? "" : "s"}`;
}

function targetSubject(count: number) {
  return count === 1 ? "this target" : `these ${count} targets`;
}

function nextLabel(schedule: CheckScheduleSummary) {
  if (!schedule.enabled || schedule.frequency === "paused") return "Next: Paused";
  if (schedule.frequency === "manual") return "Next: On request";
  return `Next: ${scheduleCadenceLabel(schedule)}`;
}

function ScheduleChoiceSkeleton() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5 px-5.5 py-3.5"
      data-testid="schedule-choice-skeleton"
    >
      <span className="mt-px h-[15px] w-[15px] rounded-full border-[1.5px] border-border-control" />
      <span className="grid gap-1.5">
        <span className="h-[18px] w-28 rounded-control bg-bg-sunken" />
        <span className="h-[17px] w-44 rounded-control bg-bg-sunken" />
      </span>
      <span className="justify-self-end">
        <span className="block h-[18px] w-20 rounded-control bg-bg-sunken" />
        <span className="mt-[3px] block h-[17px] w-24 rounded-control bg-bg-sunken" />
      </span>
    </div>
  );
}

export function SetScheduleModalChoices({
  choice,
  currentSchedule,
  currentScheduleId,
  loadError,
  loading = false,
  monthlyDelta,
  onChoose,
  onOpenNewSchedule,
  schedules,
  selectedCount,
}: Readonly<SetScheduleModalChoicesProps>) {
  const orderedSchedules = (loadError || loading ? [] : [...schedules]).sort((left, right) => {
    if (left.publicId === currentScheduleId) return -1;
    if (right.publicId === currentScheduleId) return 1;
    return 0;
  });

  return (
    <div aria-busy={loading} aria-label="Schedule" className="-mx-5.5 grid" role="radiogroup">
      {loading ? [0, 1].map((index) => <ScheduleChoiceSkeleton key={index} />) : null}
      {orderedSchedules.map((schedule) => {
        const current = schedule.publicId === currentScheduleId;
        const checked = choice === schedule.publicId;
        return (
          <label
            className="grid grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5 px-5.5 py-3.5 text-left transition-colors has-[:focus-visible]:bg-bg-sunken has-[:not(:disabled)]:hover:bg-bg-sunken"
            key={schedule.publicId}
          >
            <input
              checked={checked}
              className="sr-only"
              disabled={current}
              name="schedule-choice"
              onChange={() => onChoose(schedule.publicId)}
              type="radio"
            />
            <span
              aria-hidden
              className="mt-px grid h-[15px] w-[15px] place-items-center rounded-full border-[1.5px] border-border-control"
            >
              {checked ? <span className="h-[7px] w-[7px] rounded-full bg-accent-solid" /> : null}
            </span>
            <span className="min-w-0">
              <span className="flex min-h-[18px] items-center gap-1.5">
                <span className="truncate text-[12.5px] font-semibold leading-[18px] text-fg">
                  {schedule.name}
                </span>
                {current ? (
                  <StatusPill label="Current" showDot={false} size="sm" status="disabled" />
                ) : null}
                {!current && schedule.isDefault ? (
                  <StatusPill label="Default" showDot={false} size="sm" status="primary" />
                ) : null}
              </span>
              <span className="mt-[3px] block text-[11.5px] leading-[17px] text-fg-muted">
                {current
                  ? `All ${targetLabel(selectedCount)} already here.`
                  : `All ${targetLabel(selectedCount)} move from ${currentSchedule?.name ?? "their current schedule"}.`}
              </span>
            </span>
            <span className="min-w-0 text-right">
              <span className="block min-h-[18px] whitespace-nowrap text-[11px] leading-[18px] tabular-nums text-fg-muted">
                {monthlyDelta(schedule)}
              </span>
              <span className="mt-[3px] block whitespace-nowrap text-[10.5px] leading-[17px] text-fg-muted">
                {nextLabel(schedule)}
              </span>
            </span>
          </label>
        );
      })}
      {loadError ? (
        <p className="mx-5.5 mb-1 mt-2 text-[11.5px] leading-[17px] text-red-text" role="alert">
          {loadError}
        </p>
      ) : null}
      <button
        className="grid grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5 px-5.5 py-3.5 text-left hover:bg-bg-sunken"
        onClick={onOpenNewSchedule}
        type="button"
      >
        <span
          aria-hidden
          className="mt-px h-[15px] w-[15px] rounded-full border-[1.5px] border-border-control"
        />
        <span>
          <span className="block text-[12.5px] font-semibold leading-[18px] text-fg">
            New schedule
          </span>
          <span className="mt-[3px] block text-[11.5px] leading-[17px] text-fg-muted">
            New cadence for {targetSubject(selectedCount)}.
          </span>
        </span>
        <span className="text-right text-[11px] leading-[18px] text-fg-muted">
          Cost depends on cadence
        </span>
      </button>
      <span aria-hidden className="mx-5.5 my-[5px] h-px bg-border" />
      <label className="grid grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5 px-5.5 py-3.5 text-left has-[:focus-visible]:bg-bg-sunken has-[:not(:disabled)]:hover:bg-bg-sunken">
        <input
          checked={choice === "remove"}
          className="sr-only"
          name="schedule-choice"
          onChange={() => onChoose("remove")}
          type="radio"
        />
        <span
          aria-hidden
          className="mt-px grid h-[15px] w-[15px] place-items-center rounded-full border-[1.5px] border-border-control"
        >
          {choice === "remove" ? (
            <span className="h-[7px] w-[7px] rounded-full bg-accent-solid" />
          ) : null}
        </span>
        <span>
          <span className="block text-[12.5px] font-semibold leading-[18px] text-fg-muted">
            Remove from schedule
          </span>
          <span className="mt-[3px] block text-[11.5px] leading-[17px] text-fg-muted">
            {currentScheduleId
              ? "Only when you launch a run."
              : `All ${targetLabel(selectedCount)} already run on request.`}
          </span>
        </span>
        <span className="text-right text-[11px] leading-[18px] text-fg-muted">
          {monthlyDelta(null)}
        </span>
      </label>
    </div>
  );
}
