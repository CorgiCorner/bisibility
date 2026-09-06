"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDateTime } from "@/lib/dates/format";
import { useSyncExternalStore } from "react";

export type ZonedTimeProps = {
  format?: DateFormat;
  timeZone: string;
  value: string;
};

const subscribeBrowserTimeZone = () => () => {};
const serverBrowserTimeZone = () => null;

function browserTimeZone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    // Timezone detection only - not date-order formatting.
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(subscribeBrowserTimeZone, browserTimeZone, serverBrowserTimeZone);
}

export function ZonedTime({ format, timeZone, value }: Readonly<ZonedTimeProps>) {
  const contextFormat = useDateFormat();
  const dateFormat = format ?? contextFormat;
  const date = new Date(value);
  const iso = date.toISOString();
  const formatted = formatDateTime(date, dateFormat, timeZone);
  const browserTz = useBrowserTimeZone();
  const suffix =
    browserTz === null ? "" : browserTz === timeZone ? " (your time)" : ` (${timeZone})`;

  return (
    <time dateTime={iso}>
      {formatted}
      <span>{suffix}</span>
    </time>
  );
}
