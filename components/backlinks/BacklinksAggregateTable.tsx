"use client";

import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { tableHeaderBorderClassName } from "@/components/ui/table-header-styles";
import { type DateFormat, formatDate } from "@/lib/dates/format";
import { cn } from "@/lib/ui/cn";
import { useFormatter, useTranslations } from "next-intl";
import type { BacklinksAggregateRow, BacklinksView } from "./backlinks-table-model";

function shortDate(value: string | null, dateFormat: DateFormat) {
  return value ? formatDate(value, dateFormat) : "";
}

export function BacklinksAggregateTable({
  fetchedCount,
  rows,
  totalCount,
  view,
}: Readonly<{
  fetchedCount: number;
  rows: BacklinksAggregateRow[];
  totalCount: number;
  view: Exclude<BacklinksView, "backlinks">;
}>) {
  const t = useTranslations("projectBacklinks.workspace.table");
  const format = useFormatter();
  const dateFormat = useDateFormat();
  const labels: Record<Exclude<BacklinksView, "backlinks">, string> = {
    anchors: t("anchor"),
    referring_domains: t("referringDomain"),
    top_pages: t("topPage"),
  };
  return (
    <>
      <p className="m-0 px-4 py-2 text-[12px] text-fg-muted">
        {t("aggregateWithin", { fetched: fetchedCount, label: labels[view], total: totalCount })}
      </p>
      <div
        className={cn(
          tableHeaderBorderClassName,
          "grid grid-cols-[minmax(260px,1fr)_190px_60px_60px_70px_120px] gap-3 px-4 py-2 font-sans tabular-nums text-[10px] uppercase tracking-[.08em] text-fg-muted",
        )}
        data-table-header-border="header"
      >
        <span>{labels[view]}</span>
        <span>{t("coverage")}</span>
        <span className="text-right">DA</span>
        <span className="text-right">{t("spam")}</span>
        <span className="text-right">{t("links")}</span>
        <span>{t("firstSeen")}</span>
      </div>
      {rows.map((row) => (
        <div
          className="grid grid-cols-[minmax(260px,1fr)_190px_60px_60px_70px_120px] items-center gap-3 border-t border-border/70 px-4 py-2.5"
          key={row.key}
        >
          <span className="truncate text-[13px] font-medium">{row.label}</span>
          <span className="text-[12px] text-fg-muted">
            {t(row.coverageKind, { count: row.coverageCount })}
          </span>
          <span className="text-right font-sans tabular-nums text-[12.5px]">
            {format.number(row.domainAuthority)}
          </span>
          <span
            className={`text-right font-sans tabular-nums text-[12.5px] ${
              row.spamScore >= 5 ? "text-yellow-text" : ""
            }`}
          >
            {format.number(row.spamScore, { maximumFractionDigits: 1, minimumFractionDigits: 1 })}
          </span>
          <span className="text-right font-sans tabular-nums text-[12.5px] text-fg-muted">
            {format.number(row.linksCount)}
          </span>
          <span className="whitespace-nowrap text-[12px] text-fg-muted">
            {shortDate(row.firstSeen, dateFormat)}
          </span>
        </div>
      ))}
    </>
  );
}
