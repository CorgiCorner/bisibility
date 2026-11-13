"use client";
import type { ThirtyDaySlot, ThirtyDaySlotState } from "@/lib/achievements/thirty-days";
import { useLocale, useTranslations } from "next-intl";

const stateKey: Record<
  ThirtyDaySlotState,
  "thirtySlotDone" | "thirtySlotSkipped" | "thirtySlotToday" | "thirtySlotUpcoming"
> = {
  done: "thirtySlotDone",
  skipped: "thirtySlotSkipped",
  today: "thirtySlotToday",
  upcoming: "thirtySlotUpcoming",
};

export function ThirtyDayCalendar({ slots }: { slots: ThirtyDaySlot[] }) {
  const locale = useLocale();
  const t = useTranslations("account.achievements");
  return (
    <ol className="m-0 flex list-none gap-1 p-0" aria-label={t("thirtyCalendarLabel")}>
      {slots.map((slot) => {
        const when = new Intl.DateTimeFormat(locale, {
          weekday: "long",
          month: "short",
          day: "numeric",
          timeZone: "UTC",
        }).format(new Date(`${slot.day}T12:00:00Z`));
        const state = t(stateKey[slot.state]);
        const name =
          slot.today && slot.state !== "today"
            ? `${when}: ${t("today")}, ${state}`
            : `${when}: ${state}`;
        return (
          <li key={slot.day} className="min-w-0 flex-1">
            <span className="sr-only">{name}</span>
            <span
              aria-hidden
              data-state={slot.state}
              className={
                slot.state === "done"
                  ? "block h-4 rounded-control bg-green"
                  : slot.state === "today"
                    ? "block h-4 rounded-control bg-fg"
                    : slot.state === "skipped"
                      ? "block h-4 rounded-control bg-fg-muted"
                      : "block h-4 rounded-control bg-border"
              }
            />
          </li>
        );
      })}
    </ol>
  );
}
