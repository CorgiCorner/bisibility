"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { useDateDisplay } from "@/components/dates/DateFormatProvider";
import { MarketChip } from "@/components/markets/MarketChip";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import { formatDisplayDate } from "@/lib/dates/format";
import type { OverviewMarketRow } from "@/lib/queries/overview-markets";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";

export type ByMarketTableRow = OverviewMarketRow & {
  href: string;
  id: string;
  label: string;
};

type MarketTranslations = ReturnType<typeof useTranslations<"projectDashboard.markets">>;

function DeltaCell({ row }: Readonly<{ row: ByMarketTableRow }>) {
  const dateDisplay = useDateDisplay();
  const t = useTranslations("projectDashboard.markets");
  const Icon = row.deltaPoints > 0 ? ArrowUp : row.deltaPoints < 0 ? ArrowDown : null;
  const tone =
    row.deltaPoints > 0
      ? "text-green-text"
      : row.deltaPoints < 0
        ? "text-red-text"
        : "text-fg-muted";
  const direction =
    row.deltaPoints > 0 ? "positive" : row.deltaPoints < 0 ? "negative" : "unchanged";
  const value = t("percentagePointChange", { direction, value: Math.abs(row.deltaPoints) });

  return (
    <Tooltip
      content={t("top10Tooltip", {
        change: Math.abs(row.deltaPoints),
        days: row.rangeDays,
        direction,
        end: formatDisplayDate(row.previousPeriod.end, dateDisplay),
        start: formatDisplayDate(row.previousPeriod.start, dateDisplay),
      })}
    >
      <span
        className={`inline-flex items-center justify-end gap-[3px] whitespace-nowrap font-sans tabular-nums text-xs font-semibold ${tone}`}
      >
        {Icon ? <Icon aria-hidden size={11} weight="regular" /> : null}
        {value}
      </span>
    </Tooltip>
  );
}

function MarketCell({ row }: Readonly<{ row: ByMarketTableRow }>) {
  const t = useTranslations("projectDashboard.markets");
  return (
    <Link
      aria-label={t("viewMarket", { market: row.label })}
      className="block min-w-0"
      href={row.href}
      onClick={(event) => event.stopPropagation()}
    >
      <MarketChip
        countryCode={row.countryCode}
        languageCode={row.languageCode}
        languageLabel={row.languageLabel}
        locationLabel={row.locationLabel}
      />
    </Link>
  );
}

export function byMarketTableColumns(
  t: MarketTranslations,
): readonly DataTableColumn<ByMarketTableRow>[] {
  return [
    {
      accessorFn: (row) => row.label,
      cell: ({ row }) => <MarketCell row={row.original} />,
      header: t("market"),
      id: "market",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: t("market") },
      minSize: 224,
      size: 224,
    },
    {
      accessorFn: (row) => row.researchAvailable,
      cell: ({ row }) =>
        row.original.researchAvailable ? null : (
          <Tooltip content={t("researchUnavailable")}>
            <span className="whitespace-nowrap font-sans tabular-nums text-[9.5px] tracking-[0.3px] text-fg-muted">
              {t("researchUnavailableBadge")}
            </span>
          </Tooltip>
        ),
      header: "",
      id: "research",
      meta: { lockResize: true, sortable: false, title: t("researchAvailability") },
      minSize: 96,
      size: 96,
    },
    {
      accessorFn: (row) => row.targetCount,
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-sans tabular-nums text-xs text-fg-muted">
          {t("targetsCount", { count: row.original.targetCount })}
        </span>
      ),
      header: t("targets"),
      id: "targets",
      meta: { align: "end", lockResize: true, sortable: false, title: t("targets") },
      minSize: 92,
      size: 92,
    },
    {
      accessorFn: (row) => row.top10Share,
      cell: ({ row }) => (
        <Tooltip content={t("top10TooltipDetail", { count: row.original.targetCount })}>
          <span className="flex items-baseline gap-[7px] whitespace-nowrap font-sans tabular-nums">
            <span className="text-[13px] font-semibold text-fg">
              {t("top10Share", { value: row.original.top10Share })}
            </span>
            <span className="text-[11.5px] text-fg-muted">
              {t("top10Detail", {
                targets: row.original.targetCount,
                top10: row.original.top10Count,
              })}
            </span>
          </span>
        </Tooltip>
      ),
      header: t("top10"),
      id: "top10",
      meta: { lockResize: true, sortable: false, title: t("top10") },
      minSize: 168,
      size: 168,
    },
    {
      accessorFn: (row) => row.deltaPoints,
      cell: ({ row }) => <DeltaCell row={row.original} />,
      header: t("change"),
      id: "change",
      meta: { align: "end", lockResize: true, sortable: false, title: t("change") },
      minSize: 88,
      size: 88,
    },
    {
      accessorFn: (row) => row.trend.at(-1) ?? null,
      cell: ({ row }) => <TrendCell row={row.original} />,
      header: t("trend"),
      id: "trend",
      meta: { lockResize: true, sortable: false, title: t("trend") },
      minSize: 96,
      size: 96,
    },
    {
      cell: () => <CaretRight aria-hidden className="text-fg-muted" size={13} weight="regular" />,
      header: "",
      id: "navigate",
      meta: { lockResize: true, sortable: false, title: t("openMarket") },
      minSize: 40,
      size: 40,
    },
  ];
}

function TrendCell({ row }: Readonly<{ row: ByMarketTableRow }>) {
  const format = useFormatter();
  const t = useTranslations("projectDashboard.markets");
  const trend = format.list(row.trend.map((value) => t("top10Share", { value })));
  return (
    <Sparkline
      ariaLabel={t("top10ShareAriaLabel", {
        days: row.rangeDays,
        market: row.label,
        trend,
      })}
      color="var(--fg-muted)"
      data={row.trend}
      height={20}
      valueFormatter={(value) => (value == null ? "" : t("top10Share", { value }))}
      width={72}
    />
  );
}
