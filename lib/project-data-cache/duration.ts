type DurationMessages = (key: "hours" | "days" | "weeks", values: { count: number }) => string;

export function reuseWindowLabel(seconds: number, t: DurationMessages) {
  if (seconds >= 14 * 86_400 && seconds % (7 * 86_400) === 0) {
    return t("weeks", { count: seconds / (7 * 86_400) });
  }
  return seconds < 86_400
    ? t("hours", { count: seconds / 3_600 })
    : t("days", { count: seconds / 86_400 });
}
