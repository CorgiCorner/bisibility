"use client";

import { Sparkline } from "@/components/charts/Sparkline";
import { MarketChip } from "@/components/markets/MarketChip";
import { Card, MenuSelect, MonoText, SectionTitle, tableHeaderClassName } from "@/components/ui";
import { lensHref } from "@/lib/keywords/lens-model";
import type { OverviewDevice } from "@/lib/queries/overview-filters";
import type { OverviewMarketRow } from "@/lib/queries/overview-markets";
import { appPath } from "@/lib/routing/app-path";
import Tooltip from "@mui/material/Tooltip";
import {
  ArrowDownIcon as ArrowDown,
  ArrowUpIcon as ArrowUp,
  CaretRightIcon as CaretRight,
  ArrowsDownUpIcon as Sort,
} from "@phosphor-icons/react";
import Link from "next/link";
import { useState } from "react";

type MarketSort = "worst" | "alphabetical";

export type ByMarketRollupProps = {
  device: OverviewDevice;
  projectRef: string;
  rows: OverviewMarketRow[];
};

const sortOptions = [
  { label: "Sort: Worst first", value: "worst" },
  { label: "Sort: A-Z", value: "alphabetical" },
] as const;

const rowGrid =
  "grid min-w-[772px] grid-cols-[200px_96px_92px_168px_88px_72px_16px] items-center gap-3 px-5";

function pairLabel(row: OverviewMarketRow) {
  return `${row.locationLabel} / ${row.languageLabel}`;
}

const OFF_CATALOG_TOOLTIP =
  "No search volume or difficulty data for this market - positions are tracked normally.";

function sortedRows(rows: OverviewMarketRow[], sort: MarketSort) {
  return [...rows].sort((left, right) => {
    const alphabetical = pairLabel(left).localeCompare(pairLabel(right));
    return sort === "alphabetical"
      ? alphabetical
      : left.deltaPoints - right.deltaPoints || alphabetical;
  });
}

function Delta({ row }: Readonly<{ row: OverviewMarketRow }>) {
  const Icon = row.deltaPoints > 0 ? ArrowUp : row.deltaPoints < 0 ? ArrowDown : null;
  const tone =
    row.deltaPoints > 0
      ? "text-green-text"
      : row.deltaPoints < 0
        ? "text-red-text"
        : "text-fg-muted";
  const value = `${row.deltaPoints > 0 ? "+" : ""}${row.deltaPoints}pp`;

  return (
    <Tooltip title={row.deltaTooltip}>
      <span
        className={`inline-flex items-center justify-end gap-[3px] whitespace-nowrap font-mono text-xs font-semibold ${tone}`}
      >
        {Icon ? <Icon aria-hidden size={11} weight="bold" /> : null}
        {value}
      </span>
    </Tooltip>
  );
}

export function ByMarketRollup({ device, projectRef, rows }: Readonly<ByMarketRollupProps>) {
  const [sort, setSort] = useState<MarketSort>("worst");

  if (rows.length < 2) {
    return null;
  }

  return (
    <Card
      aria-label="By market rollup"
      className="min-w-0 overflow-hidden p-0"
      component="section"
      size="md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-[14px] pt-[18px]">
        <div className="min-w-0">
          <SectionTitle>By market</SectionTitle>
          <MonoText className="block" muted size="sm">
            {rows.length} active markets / paused markets excluded
          </MonoText>
        </div>
        <MenuSelect
          ariaLabel="Sort markets"
          leadingIcon={<Sort aria-hidden size={12} />}
          onChange={(value) => setSort(value as MarketSort)}
          options={sortOptions}
          triggerClassName="min-h-[30px]"
          value={sort}
        />
      </div>
      <div className="overflow-x-auto">
        <div className={`${rowGrid} border-t border-border py-2 ${tableHeaderClassName}`}>
          <span>Market</span>
          <span aria-hidden />
          <span className="text-right">Targets</span>
          <span>In top 10</span>
          <span className="text-right">Change</span>
          <span>Trend</span>
          <span aria-hidden />
        </div>
        {sortedRows(rows, sort).map((row) => (
          <Link
            className={`${rowGrid} min-h-[57px] border-t border-border-soft py-3 hover:bg-bg-sunken`}
            href={lensHref(appPath(projectRef, "rank-tracker"), {
              device,
              locationId: row.locationId,
            })}
            key={row.locationId}
          >
            <span className="min-w-0 overflow-hidden">
              <MarketChip languageLabel={row.languageLabel} locationLabel={row.locationLabel} />
            </span>
            <span className="min-w-0">
              {!row.researchAvailable ? (
                <Tooltip title={OFF_CATALOG_TOOLTIP}>
                  <span className="whitespace-nowrap font-mono text-[9.5px] tracking-[0.3px] text-fg-muted">
                    no volume/KD
                  </span>
                </Tooltip>
              ) : null}
            </span>
            <span className="whitespace-nowrap text-right font-mono text-xs text-fg-muted">
              {row.targetCount} targets
            </span>
            <Tooltip title={row.top10Tooltip}>
              <span className="flex items-baseline gap-[7px] whitespace-nowrap font-mono">
                <span className="text-[13px] font-semibold text-fg">{row.top10Share}%</span>
                <span className="text-[11.5px] text-fg-muted">
                  {row.top10Count} of {row.targetCount} in top 10
                </span>
              </span>
            </Tooltip>
            <span className="text-right">
              <Delta row={row} />
            </span>
            <span>
              <Sparkline
                ariaLabel={`Top-10 share for ${pairLabel(row)} over the last ${row.rangeDays} days: ${row.trend.join("%, ")}%`}
                color="var(--fg-muted)"
                data={row.trend}
                height={20}
                valueFormatter={(value) => (value == null ? "" : `${value}%`)}
                width={72}
              />
            </span>
            <CaretRight aria-hidden className="text-fg-muted" size={13} weight="bold" />
          </Link>
        ))}
      </div>
    </Card>
  );
}
