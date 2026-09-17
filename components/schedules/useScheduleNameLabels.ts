"use client";

import type { ScheduleNameLabels } from "@/lib/schedules/suggested-name";
import { useTranslations } from "next-intl";

/** Builds the generated-schedule-name copy from the shared catalog in the viewer's locale. */
export function useScheduleNameLabels(): ScheduleNameLabels {
  const t = useTranslations("shared.scheduleName");
  return {
    custom: (expression) => t("custom", { expression }),
    daily: (time) => t("daily", { time }),
    monthly: (day, time) => t("monthly", { day, time }),
    noFixedTime: t("noFixedTime"),
    weekly: (weekday, time) => t("weekly", { time, weekday }),
  };
}
