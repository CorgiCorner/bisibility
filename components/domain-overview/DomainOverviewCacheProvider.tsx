"use client";

import { useFormatter } from "next-intl";
import { createContext, type ReactNode, useContext } from "react";

const CacheTtlContext = createContext(43_200);

export function DomainOverviewCacheProvider({
  children,
  ttlSeconds,
}: Readonly<{ children: ReactNode; ttlSeconds: number }>) {
  return <CacheTtlContext value={ttlSeconds}>{children}</CacheTtlContext>;
}

export function useDomainOverviewCacheDuration() {
  const seconds = useContext(CacheTtlContext);
  const format = useFormatter();
  const [unit, divisor]: [string, number] =
    seconds % 86_400 === 0
      ? ["day", 86_400]
      : seconds % 3_600 === 0
        ? ["hour", 3_600]
        : seconds % 60 === 0
          ? ["minute", 60]
          : ["second", 1];
  return format.number(seconds / divisor, {
    style: "unit",
    unit,
    unitDisplay: "long",
  });
}
