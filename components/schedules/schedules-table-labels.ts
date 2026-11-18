import { type CronField, parseCronExpression } from "@/lib/rank-check/cron";
import { scheduleWeekdayNames } from "@/lib/schedules/cadence-label";
import type { useTranslations } from "next-intl";
import type { RankSchedulesTableRow, SchedulesTableRow } from "./schedules-table-columns";

export type SchedulesT = ReturnType<typeof useTranslations<"projectRuns.schedules">>;
type ScheduleState = "blocked" | "paused" | "empty";

export function scheduleStateMeta(t: SchedulesT) {
  return {
    empty: { label: t("list.empty"), tone: "text-fg-muted" },
    blocked: { label: t("list.blocked"), tone: "text-fg-muted" },
    paused: { label: t("list.paused"), tone: "text-fg-muted" },
  } satisfies Record<ScheduleState, { label: string; tone: string }>;
}

export function stateFor(row: SchedulesTableRow): ScheduleState | null {
  if (row.archivedAt) return null;
  if (row.scheduleKind === "ai") {
    if (row.promptCount === 0) return "empty";
    return row.enabled ? null : "paused";
  }
  if ((row.assignedKeywordCount ?? row.targetCount ?? row.keywordCount) === 0) return "empty";
  if (!row.enabled || row.frequency === "paused") return "paused";
  return row.blocked ? "blocked" : null;
}

export function memberLabel(row: SchedulesTableRow, t: SchedulesT) {
  if (row.scheduleKind === "ai") return t("ai.prompts", { count: row.promptCount });
  if (row.archivedAt) return t("list.noAssignedKeywords");
  if (row.targetCount === null || row.targetCount === undefined) {
    return t("checks", { count: row.keywordCount });
  }
  return t("list.members", {
    keywords: row.keywordCount,
    targets: row.targetCount,
  });
}

export function perRunLabel(cents: number | null | undefined, locale: string) {
  if (cents === null || cents === undefined) return "-";
  return `~${new Intl.NumberFormat(locale, { currency: "USD", style: "currency" }).format(cents / 100)}`;
}

export function nextLabel(row: SchedulesTableRow, t: SchedulesT) {
  if (stateFor(row) === "empty")
    return row.scheduleKind === "ai" ? t("ai.emptyNext") : t("list.emptyNext");
  if (row.archivedAt || !row.enabled) return "-";
  if (row.scheduleKind === "ai") return row.nextRunLabel ?? t("ai.nextPending");
  return row.nextRunLabel ?? "-";
}

const weekdayKeys = {
  Friday: "Friday",
  Monday: "Monday",
  Saturday: "Saturday",
  Sunday: "Sunday",
  Thursday: "Thursday",
  Tuesday: "Tuesday",
  Wednesday: "Wednesday",
} as const;

type CadenceRow = Pick<
  RankSchedulesTableRow,
  "cronExpression" | "timeOfDay" | "weekday" | "dayOfMonth"
> & { frequency: string };

function singleValue(field: CronField) {
  return field?.size === 1 ? [...field][0] : null;
}

function cronCadenceLabel(expression: string | null | undefined, t: SchedulesT): string {
  const fallback = () => t("cadenceLabels.custom", { expression: expression ?? "-" });
  const parsed = expression ? parseCronExpression(expression) : null;
  if (!parsed?.ok || parsed.month !== null) return fallback();
  const minute = singleValue(parsed.minute);
  const hour = singleValue(parsed.hour);
  if (minute === null) return fallback();
  if (parsed.day === null && parsed.weekday === null && parsed.hour === null)
    return t("cadenceLabels.hourly", { minute: String(minute).padStart(2, "0") });
  if (hour === null) return fallback();
  const time = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  if (parsed.day === null && parsed.weekday === null) return t("cadenceLabels.daily", { time });
  const weekday = singleValue(parsed.weekday);
  if (parsed.day === null && weekday !== null)
    return t("cadenceLabels.weekly", { day: t(`weekdays.${scheduleWeekdayNames[weekday]}`), time });
  const day = singleValue(parsed.day);
  if (parsed.weekday === null && day !== null)
    return t("cadenceLabels.monthly", { day: t("cadenceLabels.dayOfMonth", { day }), time });
  return fallback();
}

function rankCadenceLabel(row: CadenceRow, t: SchedulesT) {
  const time = row.timeOfDay ?? "-";
  if (row.timeOfDay === null && ["daily", "weekly", "monthly"].includes(row.frequency)) {
    const interval =
      row.frequency === "daily"
        ? t("intervalDay")
        : row.frequency === "weekly"
          ? t("intervalWeek")
          : t("intervalMonth");
    return t("cadenceLabels.every", { interval });
  }
  if (row.frequency === "daily") return t("cadenceLabels.daily", { time });
  if (row.frequency === "weekly") {
    const day =
      row.weekday && row.weekday in weekdayKeys
        ? t(`weekdays.${weekdayKeys[row.weekday as keyof typeof weekdayKeys]}`)
        : t("frequencyWeekly");
    return t("cadenceLabels.weekly", { day, time });
  }
  if (row.frequency === "monthly") {
    return t("cadenceLabels.monthly", {
      day: row.dayOfMonth ? t("cadenceLabels.dayOfMonth", { day: row.dayOfMonth }) : "-",
      time,
    });
  }
  if (row.frequency === "custom_cron") return cronCadenceLabel(row.cronExpression, t);
  return row.frequency === "manual" ? t("cadenceLabels.manual") : t("cadenceLabels.paused");
}

export function cadenceLabel(row: SchedulesTableRow | CadenceRow, t: SchedulesT) {
  if ("scheduleKind" in row && row.scheduleKind === "ai") return cronCadenceLabel(row.cron, t);
  return rankCadenceLabel(row, t);
}

export function cadenceMeta(row: SchedulesTableRow, t: SchedulesT) {
  if (row.scheduleKind === "ai") return row.timezone;
  const timezone = row.timezone ?? t("useProjectTimeZone");
  return !row.timeOfDay
    ? timezone
    : t("cadenceMeta", { minutes: row.jitterMinutes ?? 0, time: row.timeOfDay, timezone });
}
