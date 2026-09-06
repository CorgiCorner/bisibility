"use client";

import type { DateFormat } from "@/lib/dates/format";
import { createContext, type ReactNode, useContext } from "react";

const DateFormatContext = createContext<DateFormat>("month_first");

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
