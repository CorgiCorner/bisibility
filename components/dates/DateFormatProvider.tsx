"use client";

import type { DateDisplayContext as DateDisplayContextValue, DateFormat } from "@/lib/dates/format";
import { useLocale, useTimeZone } from "next-intl";
import { createContext, type ReactNode, useContext } from "react";

const DateFormatContext = createContext<DateFormat>("month_first");
const DateDisplayContext = createContext<DateDisplayContextValue | null>(null);

export function DateFormatProvider({
  children,
  value,
}: Readonly<{
  children: ReactNode;
  value: DateFormat;
}>) {
  return <DateFormatContext.Provider value={value}>{children}</DateFormatContext.Provider>;
}

export function useDateFormat(): DateFormat {
  return useContext(DateFormatContext);
}

/** Bridges the explicit document locale and timezone to reader-facing date components. */
export function DateDisplayProvider({ children }: Readonly<{ children: ReactNode }>) {
  const dateFormat = useDateFormat();
  const locale = useLocale();
  const timeZone = useTimeZone();
  if (!timeZone) {
    throw new Error("Date display components require an explicit document time zone.");
  }
  return (
    <DateDisplayContext.Provider value={{ dateFormat, locale, timeZone }}>
      {children}
    </DateDisplayContext.Provider>
  );
}

/** Reader-facing date components require the route's locale-aware date provider. */
export function useDateDisplay(): DateDisplayContextValue {
  const context = useContext(DateDisplayContext);
  if (!context) {
    throw new Error("Date display components must render inside DateDisplayProvider.");
  }
  return context;
}
