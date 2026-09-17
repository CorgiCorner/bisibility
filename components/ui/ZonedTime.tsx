"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDisplayDateTime } from "@/lib/dates/format";
import { useTranslations } from "next-intl";
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
  const dateDisplay = useDateDisplay();
  const t = useTranslations("shared.controls.zonedTime");
  const date = new Date(value);
  const iso = date.toISOString();
  const formatted = formatDisplayDateTime(date, {
    ...dateDisplay,
    dateFormat: format ?? dateDisplay.dateFormat,
    timeZone,
  });
  const browserTz = useBrowserTimeZone();
  const label =
    browserTz === null
      ? t("plain", { time: formatted })
      : browserTz === timeZone
        ? t("yourTime", { time: formatted })
        : t("timeZone", { time: formatted, timeZone });

  return <time dateTime={iso}>{label}</time>;
}
