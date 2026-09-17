"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import type { UpcomingForecast } from "@/lib/checks/contract";
import { useLocale, useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { formatCap, formatEstimatedAmount, formatForecastDate } from "./upcoming-format";

export type BudgetForecastNoteProps = {
  forecast: UpcomingForecast | null;
};

export function BudgetForecastNote({ forecast }: Readonly<BudgetForecastNoteProps>) {
  const dateDisplay = useDateDisplay();
  const locale = useLocale();
  const t = useTranslations("projectRankTracker.checks");
  if (!forecast || forecast.next48hCents <= 0) return null;

  const cap = formatCap(forecast.capCents, locale);
  const next48h = t("estimatedAmount", {
    amount: formatEstimatedAmount(forecast.next48hCents, locale),
    isLessThanCent: String(forecast.next48hCents > 0 && forecast.next48hCents < 1),
  });

  return (
    <p className="m-0 text-[12px] leading-relaxed text-fg-muted">
      {forecast.capLastsUntil
        ? t.rich("forecastWithDate", {
            cap,
            date: formatForecastDate(forecast.capLastsUntil, dateDisplay),
            strong: (chunks: ReactNode) => (
              <strong className="font-semibold text-fg">{chunks}</strong>
            ),
          })
        : t.rich("forecastWithoutDate", {
            cap,
            strong: (chunks: ReactNode) => (
              <strong className="font-semibold text-fg">{chunks}</strong>
            ),
          })}{" "}
      {t.rich("forecastScheduled", {
        amount: next48h,
        strong: (chunks: ReactNode) => <strong className="font-semibold text-fg">{chunks}</strong>,
      })}
    </p>
  );
}
