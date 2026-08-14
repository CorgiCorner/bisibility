"use client";

import { useSyncExternalStore } from "react";

const defaultOptions: Intl.DateTimeFormatOptions = {
  day: "numeric",
  hour: "numeric",
  hourCycle: "h23",
  minute: "2-digit",
  month: "short",
};

export type ZonedTimeProps = {
  options?: Intl.DateTimeFormatOptions;
  timeZone: string;
  value: string;
};

const subscribeBrowserTimeZone = () => () => {};
const serverBrowserTimeZone = () => null;

function browserTimeZone(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return new Intl.DateTimeFormat().resolvedOptions().timeZone ?? null;
  } catch {
    return null;
  }
}

export function useBrowserTimeZone(): string | null {
  return useSyncExternalStore(subscribeBrowserTimeZone, browserTimeZone, serverBrowserTimeZone);
}

export function ZonedTime({ options = defaultOptions, timeZone, value }: Readonly<ZonedTimeProps>) {
  const date = new Date(value);
  const iso = date.toISOString();
  const formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone });
  const formatted = formatter.format(date);
  const browserTz = useBrowserTimeZone();
  const suffix =
    browserTz === null ? "" : browserTz === timeZone ? " (your time)" : ` (${timeZone})`;

  return (
    <time dateTime={iso} suppressHydrationWarning>
      {formatted}
      <span>{suffix}</span>
    </time>
  );
}
