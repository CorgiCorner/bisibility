import { useTranslations } from "next-intl";
import { formatDuration } from "./format-duration";

export function useFormatDuration() {
  const t = useTranslations("shared.durationUnits");
  return (totalSeconds: number) =>
    formatDuration(totalSeconds, {
      days: ({ count }) => t("days", { count }),
      hours: ({ count }) => t("hours", { count }),
      minutes: ({ count }) => t("minutes", { count }),
      weeks: ({ count }) => t("weeks", { count }),
    });
}
