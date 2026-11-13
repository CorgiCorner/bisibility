"use client";

import type { ChallengeDay, ChallengeDayState } from "@/lib/challenge-report/challenge-window";
import { cn } from "@/lib/ui/cn";
import { useFormatter, useTranslations } from "next-intl";

const stateClassName: Record<ChallengeDayState, string> = {
  checked: "bg-green-text text-accent-on-solid dark:text-bg",
  missed: "bg-meter-track text-fg-muted",
  today: "border border-fg font-semibold text-fg",
  upcoming: "border border-border-soft text-fg-muted",
};

const cellClassName =
  "flex h-7 w-full items-center justify-center rounded-control text-ui-micro tabular-nums";

/**
 * The 30 calendar days of a project challenge. Missed or current days become
 * buttons when `onMark` is given; checked and upcoming days never do.
 */
export function ChallengeCalendar({
  days,
  marking,
  onMark,
}: Readonly<{
  days: readonly ChallengeDay[];
  marking?: string | null;
  onMark?: (day: ChallengeDay) => void;
}>) {
  const t = useTranslations("challengeReport.calendar");
  const format = useFormatter();
  return (
    <ol
      aria-label={t("label")}
      className="m-0 grid list-none grid-cols-10 gap-1 p-0 sm:grid-cols-[repeat(15,minmax(0,1fr))] lg:grid-cols-[repeat(30,minmax(0,1fr))]"
    >
      {days.map((day) => {
        const values = {
          date: format.dateTime(new Date(`${day.day}T12:00:00Z`), {
            day: "numeric",
            month: "short",
            timeZone: "UTC",
            weekday: "short",
          }),
          index: day.index,
        };
        return (
          <li className="min-w-0" key={day.day}>
            {onMark && day.markable ? (
              <button
                aria-label={t("mark", values)}
                className={cn(
                  cellClassName,
                  stateClassName[day.state],
                  "cursor-pointer outline-offset-2 hover:bg-accent-soft hover:text-accent-text disabled:cursor-wait",
                )}
                disabled={marking === day.day}
                onClick={() => onMark(day)}
                type="button"
              >
                {day.index}
              </button>
            ) : (
              <span className={cn(cellClassName, stateClassName[day.state])}>
                <span aria-hidden>{day.index}</span>
                <span className="sr-only">{t(day.state, values)}</span>
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
