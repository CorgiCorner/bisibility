"use client";

import { formatPublicNumber } from "@/lib/report-sharing/format";
import { useFormatter, useLocale } from "next-intl";
import { createContext, type ReactNode, useContext } from "react";

const ReportRoundContext = createContext(false);

export function ReportRoundProvider({
  children,
  round,
}: Readonly<{ children: ReactNode; round: boolean }>) {
  return <ReportRoundContext.Provider value={round}>{children}</ReportRoundContext.Provider>;
}

export function useReportRound() {
  return useContext(ReportRoundContext);
}

export function useReportFigure() {
  const round = useReportRound();
  const locale = useLocale();
  const format = useFormatter();
  return (value: number) =>
    round
      ? formatPublicNumber(value, true, locale)
      : format.number(value, { maximumFractionDigits: 0 });
}
