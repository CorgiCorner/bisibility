"use client";

import { useFormatter } from "next-intl";

// Calendar keys are project-local dates, not instants to shift into the viewer's zone.
export function useIndexingDate() {
  const format = useFormatter();
  return (key: string, year = false) =>
    format.dateTime(new Date(`${key}T00:00:00Z`), {
      month: "short",
      day: "numeric",
      ...(year ? { year: "numeric" } : {}),
      timeZone: "UTC",
    });
}
