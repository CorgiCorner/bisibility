import { projectDate, projectDayStart } from "@/lib/presence/project-day";
import { annotationWindow } from "./types";

/** Inclusive calendar days a note can pin on: the chart window through today. */
export function annotationNoteDayBounds(now: Date, timeZone: string) {
  return {
    max: projectDate(now, timeZone),
    min: projectDate(annotationWindow(now).start, timeZone),
  };
}

/** Start of the chosen project day, or null when the day is outside the window. */
export function annotationNoteHappenedAt(day: string, now: Date, timeZone: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null;
  const bounds = annotationNoteDayBounds(now, timeZone);
  if (day < bounds.min || day > bounds.max) return null;
  return projectDayStart(day, timeZone);
}
