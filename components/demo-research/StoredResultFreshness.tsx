"use client";

import { ClockIcon as Clock } from "@phosphor-icons/react/dist/csr/Clock";
import { useFormatter, useTranslations } from "next-intl";

export type StoredResultFreshness = {
  fetchedAt: string;
  freshUntil: string;
  stale: boolean;
};

function collectedAt(value: string, format: ReturnType<typeof useFormatter>) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? null
    : format.dateTime(date, { dateStyle: "medium", timeStyle: "short" });
}

export function StoredResultFreshness({ fetchedAt, stale }: Readonly<StoredResultFreshness>) {
  const format = useFormatter();
  const t = useTranslations("projectResearch.demo");
  const collected = collectedAt(fetchedAt, format) ?? t("unknownTime");
  return (
    <span
      className="inline-flex flex-wrap items-center gap-x-1.5 gap-y-1 rounded-full border border-border bg-bg-sunken px-2.5 py-1 text-[11px] text-fg-muted"
      data-testid="stored-result-freshness"
    >
      <Clock aria-hidden size={11} weight="regular" />
      <span>{t("storedResult")}</span>
      <span aria-hidden>·</span>
      <span>{t("collected", { date: collected })}</span>
      <span aria-hidden>·</span>
      <span className={stale ? "text-yellow-text" : "text-green-text"}>
        {stale ? t("pastRefreshWindow") : t("freshFor", { days: 30 })}
      </span>
    </span>
  );
}
