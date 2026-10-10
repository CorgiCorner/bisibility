"use client";

import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { tableHeaderBorderClassName } from "@/components/ui/table-header-styles";
import type { CompetitorMarket } from "@/lib/competitors/types";
import { cn } from "@/lib/ui/cn";
import { UploadSimpleIcon as UploadSimple } from "@phosphor-icons/react/dist/csr/UploadSimple";
import { useTranslations } from "next-intl";
import { useState } from "react";

type HeadToHeadTableProps = {
  market: CompetitorMarket;
  onExport: () => void;
};

const ROW_PAGE_SIZE = 100;
type CompetitorTranslations = ReturnType<typeof useTranslations<"projectCompetitors.ui">>;

function formatRank(rank: number | null, t: CompetitorTranslations) {
  return rank ? t("rank", { rank }) : t("notAvailable");
}

function formatGap(gap: number | null, t: CompetitorTranslations) {
  if (gap === null) {
    return t("notAvailable");
  }
  return gap > 0 ? t("positiveNumber", { value: gap }) : t("number", { value: gap });
}

function gapColor(gap: number | null) {
  if (gap === null) {
    return "var(--fg-muted)";
  }
  if (gap > 0) {
    return "var(--green)";
  }
  if (gap < 0) {
    return "var(--red)";
  }
  return "var(--fg-muted)";
}

function rankColor(columnIndex: number, gap: number | null) {
  if (columnIndex !== 0) {
    return "var(--fg-muted)";
  }
  if (gap === null) {
    return "var(--fg)";
  }
  return gap >= 0 ? "var(--green)" : "var(--accent)";
}

export function HeadToHeadTable({ market, onExport }: Readonly<HeadToHeadTableProps>) {
  const t = useTranslations("projectCompetitors.ui");
  const [expanded, setExpanded] = useState(false);
  const [visibleRows, setVisibleRows] = useState(ROW_PAGE_SIZE);
  const hiddenCount = Math.max(0, market.columns.length - 4);
  const columns = expanded ? market.columns : market.columns.slice(0, 4);
  const gridTemplateColumns = `minmax(150px,2fr) repeat(${columns.length}, minmax(88px,1fr)) 72px`;
  const hasCompetitors = market.columns.length > 1;
  const rows = market.rows.slice(0, visibleRows);
  const hiddenRowCount = market.rows.length - rows.length;
  const emptyCopy =
    market.dataState === "filter_excludes_all"
      ? t("headToHeadFilteredEmpty")
      : market.dataState === "no_completed_checks"
        ? t("headToHeadNoChecks")
        : t("headToHeadEmpty");

  return (
    <Card className="overflow-hidden p-0" size="md">
      <div
        className={cn(
          "flex flex-wrap items-center justify-between gap-3 px-4.5 py-[15px]",
          !hasCompetitors && "border-b border-border",
        )}
      >
        <div className="flex min-w-0 flex-col gap-1">
          <SectionTitle>{t("sharedKeywordsHeadToHead")}</SectionTitle>
          <p className="m-0 font-sans tabular-nums text-[11px] text-fg-muted">
            {t("headToHeadScope", {
              device: market.device === "mobile" ? t("mobile") : t("desktop"),
              language: market.languageLabel,
              location: market.location,
              shared: market.sharedKeywordCount,
              tracked: market.trackedKeywordCount,
            })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {hiddenCount > 0 ? (
            <button
              className="inline-flex min-h-8 items-center rounded-control border border-border-control bg-bg-elev px-3 text-xs font-semibold text-fg-muted hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
              onClick={() => setExpanded((value) => !value)}
              type="button"
            >
              {expanded ? t("showTopCompetitors") : t("showMorePositive", { count: hiddenCount })}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-8 items-center gap-1.5 rounded-control border border-border-control bg-bg-elev px-3 text-xs font-semibold text-fg-muted outline-none transition-colors hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text"
            onClick={onExport}
            type="button"
          >
            <UploadSimple weight="regular" aria-hidden size={13} />
            {t("export")}
          </button>
        </div>
      </div>

      {!hasCompetitors ? (
        <div className="bg-bg-sunken px-4.5 py-3 font-sans tabular-nums text-[10.5px] text-fg-muted">
          {t("addCompetitorHeadToHead")}
        </div>
      ) : null}

      <div className="overflow-x-auto">
        <div className="min-w-[720px]">
          <div
            className={cn(
              tableHeaderBorderClassName,
              "grid gap-x-2.5 bg-bg-sunken px-4.5 py-2.5 font-sans tabular-nums text-[10px] uppercase text-fg-muted",
            )}
            data-table-header-border="header"
            style={{ gridTemplateColumns }}
          >
            <span>{t("keyword")}</span>
            {columns.map((column, index) => (
              <span className={index === 0 ? "text-accent-text" : undefined} key={column.domain}>
                {column.label}
              </span>
            ))}
            <span className="text-right">{t("gap")}</span>
          </div>
          {rows.map((row, index) => (
            <div
              className={`grid items-center gap-x-2.5 border-border px-4.5 py-2.5 ${
                index === rows.length - 1 ? "" : "border-b"
              }`}
              key={row.id}
              style={{ gridTemplateColumns }}
            >
              <span className="truncate text-[13px] font-medium">{row.keyword}</span>
              {columns.map((column, index) => (
                <span
                  className="font-sans tabular-nums text-[13px] font-semibold"
                  key={column.domain}
                  style={{ color: rankColor(index, row.gap) }}
                >
                  {formatRank(row.ranks[column.domain] ?? null, t)}
                </span>
              ))}
              <span
                className="text-right font-sans tabular-nums text-xs font-semibold"
                style={{ color: gapColor(row.gap) }}
              >
                {formatGap(row.gap, t)}
              </span>
            </div>
          ))}
          {market.rows.length === 0 ? (
            <div className="px-4.5 py-5 text-[13px] text-fg-muted">{emptyCopy}</div>
          ) : null}
          {hiddenRowCount > 0 ? (
            <div className="flex items-center justify-between gap-3 px-4.5 py-3 text-xs text-fg-muted">
              <span>{t("showingKeywords", { count: rows.length, total: market.rows.length })}</span>
              <button
                className="inline-flex min-h-8 items-center rounded-control border border-border-control bg-bg-elev px-3 font-semibold text-fg-muted hover:border-accent hover:text-accent-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
                onClick={() => setVisibleRows((count) => count + ROW_PAGE_SIZE)}
                type="button"
              >
                {t("showMore", { count: Math.min(ROW_PAGE_SIZE, hiddenRowCount) })}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </Card>
  );
}
