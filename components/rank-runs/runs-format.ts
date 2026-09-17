import type { RankRunRecord } from "./runs-types";

export function isSkippedOccurrence(
  run: Pick<RankRunRecord, "finishedAt" | "launchedAt" | "status">,
) {
  return run.status === "cancelled" && run.launchedAt === null && run.finishedAt !== null;
}

function plannedDateParts(value: string, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    day: "2-digit",
    month: "2-digit",
    timeZone,
    year: "numeric",
  }).formatToParts(new Date(value));
}

function plannedDayKey(value: string, timeZone: string) {
  const parts = plannedDateParts(value, timeZone);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((entry) => entry.type === type)?.value ?? "00";
  return `${part("year")}-${part("month")}-${part("day")}`;
}

export function plannedRunDayKey(value: string | null, timeZone: string) {
  return value ? plannedDayKey(value, timeZone) : "unscheduled";
}
