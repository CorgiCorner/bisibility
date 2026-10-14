"use client";

import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { formatDisplayDateTime } from "@/lib/dates/format";
import { useTranslations } from "next-intl";

export function HistoryTime({
  value,
  timeZone,
}: Readonly<{ value: string | null; timeZone: string }>) {
  const display = useDateDisplay();
  const t = useTranslations("projectRankTracker.keywordDetail.recordedHistory");
  const date = value === null ? null : new Date(value);
  if (!date || !Number.isFinite(date.getTime())) return <span>{t("unknownTime")}</span>;
  return (
    <time dateTime={date.toISOString()}>
      {formatDisplayDateTime(date, { ...display, timeZone })}
    </time>
  );
}

export function historyExternalUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
