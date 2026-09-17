import { StatusPill } from "@/components/ui/StatusPill";
import { persistedScheduleCalendar } from "@/lib/schedules/cadence-label";
import { useTranslations } from "next-intl";
import type {
  CheckScheduleSummary,
  ScheduleChoice,
  ScheduleLoadProblem,
} from "./set-schedule-model";

type SetScheduleModalChoicesProps = {
  choice: ScheduleChoice;
  currentSchedule: CheckScheduleSummary | null;
  currentScheduleId: string | null;
  hasScheduledTargets: boolean;
  loadError?: ScheduleLoadProblem | null;
  loading?: boolean;
  monthlyDelta: (schedule: CheckScheduleSummary | null) => string;
  onChoose: (choice: ScheduleChoice) => void;
  onOpenNewSchedule: () => void;
  schedules: readonly CheckScheduleSummary[];
  selectedCount: number;
};

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
  hasScheduledTargets,
  loadError,
  loading = false,
  monthlyDelta,
  onChoose,
  onOpenNewSchedule,
  schedules,
  selectedCount,
}: Readonly<SetScheduleModalChoicesProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.schedule");
  const loadErrorMessage =
    loadError === "unauthorized"
      ? t("loadUnauthorized")
      : loadError === "forbidden"
        ? t("loadForbidden")
        : loadError === "notFound"
          ? t("loadNotFound")
          : loadError === "validation"
            ? t("loadValidationFailed")
            : t("loadFailed");
  const orderedSchedules = (loadError || loading ? [] : [...schedules]).sort((left, right) => {
    if (left.publicId === currentScheduleId) return -1;
    if (right.publicId === currentScheduleId) return 1;
    return 0;
  });
  const weekdayKeys = {
    Friday: "weekdayFriday",
    Monday: "weekdayMonday",
    Saturday: "weekdaySaturday",
    Sunday: "weekdaySunday",
    Thursday: "weekdayThursday",
    Tuesday: "weekdayTuesday",
    Wednesday: "weekdayWednesday",
  } as const;

  function weekdayLabel(weekday: string | null) {
    const key = weekday ? weekdayKeys[weekday as keyof typeof weekdayKeys] : undefined;
    return key ? t(key) : t("weekdayUnknown");
  }

  function dayOfMonthLabel(dayOfMonth: string | null) {
    const day = Number.parseInt(dayOfMonth ?? "", 10);
    return Number.isInteger(day) && day > 0 && day <= 31
      ? t("dayOfMonthValue", { day })
      : t("dayOfMonthUnknown");
  }

  function nextLabel(schedule: CheckScheduleSummary) {
    if (!schedule.enabled || schedule.frequency === "paused") return t("nextPaused");
    if (schedule.frequency === "manual") return t("nextOnRequest");
    if (schedule.frequency === "custom_cron") {
      return t("nextCustom", { cron: schedule.cronExpression ?? "-" });
    }
    if (schedule.timeOfDay == null) {
      const frequency =
        schedule.frequency === "daily"
          ? t("frequencyDaily")
          : schedule.frequency === "weekly"
            ? t("frequencyWeekly")
            : t("frequencyMonthly");
      return t("nextNoFixedTime", { frequency });
    }
    if (schedule.frequency === "daily") return t("nextDaily", { time: schedule.timeOfDay });
    if (schedule.frequency === "weekly") {
      const calendar = persistedScheduleCalendar(schedule.frequency, schedule.cronExpression);
      return t("nextWeekly", {
        day: weekdayLabel(schedule.weekday ?? calendar.weekday),
        time: schedule.timeOfDay,
      });
    }
    if (schedule.frequency === "monthly") {
      const calendar = persistedScheduleCalendar(schedule.frequency, schedule.cronExpression);
      return t("nextMonthly", {
        day: dayOfMonthLabel(schedule.dayOfMonth ?? calendar.dayOfMonth),
        time: schedule.timeOfDay,
      });
    }
    return t("nextPaused");
  }

  return (
    <div aria-busy={loading} aria-label={t("ariaLabel")} className="-mx-5.5 grid" role="radiogroup">
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
                  <StatusPill label={t("current")} showDot={false} size="sm" status="disabled" />
                ) : null}
                {!current && schedule.isDefault ? (
                  <StatusPill label={t("default")} showDot={false} size="sm" status="primary" />
                ) : null}
              </span>
              <span className="mt-[3px] block text-[11.5px] leading-[17px] text-fg-muted">
                {current
                  ? t("alreadyAssigned", { count: selectedCount })
                  : currentSchedule
                    ? t("moveFrom", { count: selectedCount, name: currentSchedule.name })
                    : t("assignTo", { count: selectedCount })}
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
          {loadErrorMessage}
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
            {t("new")}
          </span>
          <span className="mt-[3px] block text-[11.5px] leading-[17px] text-fg-muted">
            {t("newDescription", { count: selectedCount })}
          </span>
        </span>
        <span className="text-right text-[11px] leading-[18px] text-fg-muted">
          {t("cadenceCost")}
        </span>
      </button>
      <span aria-hidden className="mx-5.5 my-[5px] h-px bg-border" />
      <label className="has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-60 grid grid-cols-[15px_minmax(0,1fr)_minmax(0,1fr)] items-start gap-2.5 px-5.5 py-3.5 text-left has-[:focus-visible]:bg-bg-sunken has-[:not(:disabled)]:hover:bg-bg-sunken">
        <input
          checked={choice === "remove" && Boolean(currentScheduleId)}
          disabled={!currentScheduleId}
          className="sr-only"
          name="schedule-choice"
          onChange={() => onChoose("remove")}
          type="radio"
        />
        <span
          aria-hidden
          className="mt-px grid h-[15px] w-[15px] place-items-center rounded-full border-[1.5px] border-border-control"
        >
          {choice === "remove" && currentScheduleId ? (
            <span className="h-[7px] w-[7px] rounded-full bg-accent-solid" />
          ) : null}
        </span>
        <span>
          <span className="block text-[12.5px] font-semibold leading-[18px] text-fg-muted">
            {t("removeFrom")}
          </span>
          <span className="mt-[3px] block text-[11.5px] leading-[17px] text-fg-muted">
            {currentScheduleId
              ? t("removeWhenRun")
              : hasScheduledTargets
                ? t("removeMixed")
                : t("removeManual", { count: selectedCount })}
          </span>
        </span>
        <span className="text-right text-[11px] leading-[18px] text-fg-muted">
          {monthlyDelta(null)}
        </span>
      </label>
    </div>
  );
}
