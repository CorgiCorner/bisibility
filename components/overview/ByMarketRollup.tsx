"use client";

import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { MenuSelect } from "@/components/ui/MenuSelect";
import { SectionTitle } from "@/components/ui/SectionTitle";
import { lensHref } from "@/lib/keywords/lens-model";
import type { OverviewDevice } from "@/lib/queries/overview-filters";
import type { OverviewMarketRow } from "@/lib/queries/overview-markets";
import { appPath } from "@/lib/routing/app-path";
import { ArrowsDownUpIcon as Sort } from "@phosphor-icons/react/dist/csr/ArrowsDownUp";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { type ByMarketTableRow, byMarketTableColumns } from "./by-market-table-columns";

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

function pairLabel(row: OverviewMarketRow) {
  return `${row.locationLabel} / ${row.languageLabel}`;
}

function tableRows(
  rows: OverviewMarketRow[],
  device: OverviewDevice,
  projectRef: string,
  sort: MarketSort,
): ByMarketTableRow[] {
  return rows
    .map((row) => ({
      ...row,
      href: lensHref(appPath(projectRef, "rank-tracker"), { device, locationId: row.locationId }),
      id: row.locationId,
      label: pairLabel(row),
    }))
    .sort((left, right) => {
      const alphabetical = pairLabel(left).localeCompare(pairLabel(right));
      return sort === "alphabetical"
        ? alphabetical
        : left.deltaPoints - right.deltaPoints || alphabetical;
    });
}

export function ByMarketRollup({ device, projectRef, rows }: Readonly<ByMarketRollupProps>) {
  const router = useRouter();
  const [sort, setSort] = useState<MarketSort>("worst");
  const tableData = tableRows(rows, device, projectRef, sort);

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
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3.5 pt-4.5">
        <div className="min-w-0">
          <SectionTitle>By market</SectionTitle>
          <span className="block">{rows.length} active markets / paused markets excluded</span>
        </div>
        <MenuSelect
          ariaLabel="Sort markets"
          leadingIcon={<Sort weight="regular" aria-hidden size={12} />}
          onChange={(value) => setSort(value as MarketSort)}
          options={sortOptions}
          triggerClassName="min-h-[30px]"
          value={sort}
        />
      </div>
      <div className="min-w-0 [&>[role=table]]:border-0">
        <DataTable
          ariaLabel="By market rollup"
          columns={byMarketTableColumns()}
          density="compact"
          id="by-market-rollup"
          layout="auto"
          onRowClick={(row) => router.push(row.href)}
          onSortingChange={() => undefined}
          rows={tableData}
          sorting={null}
          sortingMode="client"
        />
      </div>
    </Card>
  );
}
