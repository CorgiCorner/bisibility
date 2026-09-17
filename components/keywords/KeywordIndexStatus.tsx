"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDate } from "@/lib/dates/format";
import type { UrlPresenceView } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";

export type IndexStatusDisplay = {
  canonicalOk: boolean | null;
  checkedAt: string;
  crawledAt: string | null;
  indexed: boolean;
};

function dateLabel(value: string, dateFormat: DateFormat) {
  return formatDate(value.slice(0, 10), dateFormat);
}

export function indexStatusDisplay(
  presence: UrlPresenceView | null | undefined,
  dateFormat: DateFormat = "month_first",
): IndexStatusDisplay | null {
  if (!presence) return null;
  return {
    canonicalOk: presence.canonicalOk,
    checkedAt: dateLabel(presence.checkedAt, dateFormat),
    crawledAt: presence.lastCrawlAt ? dateLabel(presence.lastCrawlAt, dateFormat) : null,
    indexed: presence.indexed,
  };
}

export function KeywordIndexStatus({
  presence,
}: Readonly<{
  presence: UrlPresenceView | null | undefined;
}>) {
  const dateFormat = useDateFormat();
  const t = useTranslations("projectRankTracker.keywordDetail.header");
  const display = indexStatusDisplay(presence, dateFormat);
  if (!display) return null;
  const fields = [
    { label: t("indexed"), value: display.indexed ? t("yes") : t("no") },
    {
      label: t("canonical"),
      value:
        display.canonicalOk === true
          ? t("self")
          : display.canonicalOk === false
            ? t("mismatch")
            : t("unknown"),
    },
    { label: t("crawled"), value: display.crawledAt ?? t("notCrawled") },
    { label: t("lastInspected"), value: display.checkedAt },
  ];

  return (
    <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 font-sans tabular-nums text-[11px] text-fg-muted">
      <span className="uppercase tracking-[0.5px] text-fg-muted">{t("indexStatus")}</span>
      {fields.map((field) => (
        <span key={field.label}>
          <span className="sr-only">{field.label}: </span>
          <span className="font-semibold text-fg">{field.label}</span> · {field.value}
        </span>
      ))}
    </footer>
  );
}
