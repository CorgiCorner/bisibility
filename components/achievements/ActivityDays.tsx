"use client";
import { Tooltip } from "@/components/ui/Tooltip";
import { shiftDay } from "@/lib/achievements/calendar";
import { CheckIcon } from "@phosphor-icons/react/dist/csr/Check";
import { useLocale, useTranslations } from "next-intl";
import styles from "./achievements.module.css";
export function ActivityDays({ today, days }: { today: string; days: string[] }) {
  const locale = useLocale(),
    t = useTranslations("account.achievements");
  return (
    <ol data-activity-days className={styles.days} aria-label={t("calendarLabel")}>
      {Array.from({ length: 7 }, (_, i) => shiftDay(today, i - 6)).map((day) => {
        const date = new Date(`${day}T12:00:00Z`),
          done = days.includes(day),
          isToday = day === today;
        const label = new Intl.DateTimeFormat(locale, {
          weekday: "long",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(date);
        const weekday = new Intl.DateTimeFormat(locale, { weekday: "short", timeZone: "UTC" })
          .format(date)
          .replace(/\.$/, "");
        return (
          <li
            key={day}
            className={styles.day}
            data-done={done || undefined}
            data-today={isToday || undefined}
          >
            <Tooltip
              wrapperClassName="flex w-full"
              content={`${label}${isToday ? ` · ${t("today")}` : ""}`}
            >
              <div className={styles.dayContent}>
                <span className="sr-only">{`${label}: ${done ? t("completedDay") : t("emptyDay")}`}</span>
                <span aria-hidden className={styles.weekday}>
                  {weekday}
                </span>
                <time aria-hidden dateTime={day} className={styles.dayNumber}>
                  {date.getUTCDate()}
                </time>
                <span className={styles.dayMark} aria-hidden>
                  {done ? <CheckIcon size={13} weight="bold" /> : <span className={styles.rest} />}
                </span>
              </div>
            </Tooltip>
            <span aria-hidden className={styles.dayTrace} />
          </li>
        );
      })}
    </ol>
  );
}
