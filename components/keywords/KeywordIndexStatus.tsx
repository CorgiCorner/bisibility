"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { type DateFormat, formatDate } from "@/lib/dates/format";
import type { UrlPresenceView } from "@/lib/queries/keywords";

export type IndexStatusDisplay = {
  fields: { label: string; value: string }[];
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
    fields: [
      { label: "Indexed", value: presence.indexed ? "Yes" : "No" },
      {
        label: "Canonical",
        value:
          presence.canonicalOk === true
            ? "Self"
            : presence.canonicalOk === false
              ? "Mismatch"
              : "Unknown",
      },
      {
        label: "Crawled",
        value: presence.lastCrawlAt ? dateLabel(presence.lastCrawlAt, dateFormat) : "Not crawled",
      },
      { label: "Last inspected", value: dateLabel(presence.checkedAt, dateFormat) },
    ],
  };
}

export function KeywordIndexStatus({
  presence,
}: Readonly<{
  presence: UrlPresenceView | null | undefined;
}>) {
  const dateFormat = useDateFormat();
  const display = indexStatusDisplay(presence, dateFormat);
  if (!display) return null;

  return (
    <footer className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border pt-3 font-sans tabular-nums text-[11px] text-fg-muted">
      <span className="uppercase tracking-[0.5px] text-fg-muted">Index status</span>
      {display.fields.map((field) => (
        <span key={field.label}>
          <span className="sr-only">{field.label}: </span>
          <span className="font-semibold text-fg">{field.label}</span> · {field.value}
        </span>
      ))}
    </footer>
  );
}
