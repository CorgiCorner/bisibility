"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { MarketChip } from "@/components/markets/MarketChip";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import type { OverviewMarketRow } from "@/lib/queries/overview-markets";
import { ArrowDownIcon as ArrowDown } from "@phosphor-icons/react/dist/csr/ArrowDown";
import { ArrowUpIcon as ArrowUp } from "@phosphor-icons/react/dist/csr/ArrowUp";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import Link from "next/link";

const OFF_CATALOG_TOOLTIP =
  "No search volume or difficulty data for this market - positions are tracked normally.";

export type ByMarketTableRow = OverviewMarketRow & {
  href: string;
  id: string;
  label: string;
};

function DeltaCell({ row }: Readonly<{ row: ByMarketTableRow }>) {
  const Icon = row.deltaPoints > 0 ? ArrowUp : row.deltaPoints < 0 ? ArrowDown : null;
  const tone =
    row.deltaPoints > 0
      ? "text-green-text"
      : row.deltaPoints < 0
        ? "text-red-text"
        : "text-fg-muted";
  const value = `${row.deltaPoints > 0 ? "+" : ""}${row.deltaPoints}pp`;

  return (
    <Tooltip content={row.deltaTooltip}>
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
  return (
    <Link
      aria-label={`View ${row.label}`}
      className="block min-w-0"
      href={row.href}
      onClick={(event) => event.stopPropagation()}
    >
      <MarketChip languageLabel={row.languageLabel} locationLabel={row.locationLabel} />
    </Link>
  );
}

export function byMarketTableColumns(): readonly DataTableColumn<ByMarketTableRow>[] {
  return [
    {
      accessorFn: (row) => row.label,
      cell: ({ row }) => <MarketCell row={row.original} />,
      header: "Market",
      id: "market",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: "Market" },
      minSize: 224,
      size: 224,
    },
    {
      accessorFn: (row) => row.researchAvailable,
      cell: ({ row }) =>
        row.original.researchAvailable ? null : (
          <Tooltip content={OFF_CATALOG_TOOLTIP}>
            <span className="whitespace-nowrap font-sans tabular-nums text-[9.5px] tracking-[0.3px] text-fg-muted">
              no volume/KD
            </span>
          </Tooltip>
        ),
      header: "",
      id: "research",
      meta: { lockResize: true, sortable: false, title: "Research availability" },
      minSize: 96,
      size: 96,
    },
    {
      accessorFn: (row) => row.targetCount,
      cell: ({ row }) => (
        <span className="whitespace-nowrap font-sans tabular-nums text-xs text-fg-muted">
          {row.original.targetCount} targets
        </span>
      ),
      header: "Targets",
      id: "targets",
      meta: { align: "end", lockResize: true, sortable: false, title: "Targets" },
      minSize: 92,
      size: 92,
    },
    {
      accessorFn: (row) => row.top10Share,
      cell: ({ row }) => (
        <Tooltip content={row.original.top10Tooltip}>
          <span className="flex items-baseline gap-[7px] whitespace-nowrap font-sans tabular-nums">
            <span className="text-[13px] font-semibold text-fg">{row.original.top10Share}%</span>
            <span className="text-[11.5px] text-fg-muted">
              {row.original.top10Count} of {row.original.targetCount} in top 10
            </span>
          </span>
        </Tooltip>
      ),
      header: "In top 10",
      id: "top10",
      meta: { lockResize: true, sortable: false, title: "In top 10" },
      minSize: 168,
      size: 168,
    },
    {
      accessorFn: (row) => row.deltaPoints,
      cell: ({ row }) => <DeltaCell row={row.original} />,
      header: "Change",
      id: "change",
      meta: { align: "end", lockResize: true, sortable: false, title: "Change" },
      minSize: 88,
      size: 88,
    },
    {
      accessorFn: (row) => row.trend.at(-1) ?? null,
      cell: ({ row }) => (
        <Sparkline
          ariaLabel={`Top-10 share for ${row.original.label} over the last ${row.original.rangeDays} days: ${row.original.trend.join("%, ")}%`}
          color="var(--fg-muted)"
          data={row.original.trend}
          height={20}
          valueFormatter={(value) => (value == null ? "" : `${value}%`)}
          width={72}
        />
      ),
      header: "Trend",
      id: "trend",
      meta: { lockResize: true, sortable: false, title: "Trend" },
      minSize: 96,
      size: 96,
    },
    {
      cell: () => <CaretRight aria-hidden className="text-fg-muted" size={13} weight="regular" />,
      header: "",
      id: "navigate",
      meta: { lockResize: true, sortable: false, title: "Open market" },
      minSize: 40,
      size: 40,
    },
  ];
}
