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
import { useTranslations } from "next-intl";
import { useState } from "react";
import { type ByMarketTableRow, byMarketTableColumns } from "./by-market-table-columns";

type MarketSort = "worst" | "alphabetical";

export type ByMarketRollupProps = {
  device: OverviewDevice;
  projectRef: string;
  rows: OverviewMarketRow[];
};

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
  const t = useTranslations("projectDashboard.markets");
  const [sort, setSort] = useState<MarketSort>("worst");
  const tableData = tableRows(rows, device, projectRef, sort);
  const sortOptions = [
    { label: t("sortWorstFirst"), value: "worst" },
    { label: t("sortAlphabetical"), value: "alphabetical" },
  ] as const;

  if (rows.length < 2) {
    return null;
  }

  return (
    <Card
      aria-label={t("title")}
      className="min-w-0 overflow-hidden p-0"
      component="section"
      size="md"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 pb-3.5 pt-4.5">
        <div className="min-w-0">
          <SectionTitle>{t("title")}</SectionTitle>
          <span className="block">{t("activeMarkets", { count: rows.length })}</span>
        </div>
        <MenuSelect
          ariaLabel={t("sortAriaLabel")}
          leadingIcon={<Sort weight="regular" aria-hidden size={12} />}
          onChange={(value) => setSort(value as MarketSort)}
          options={sortOptions}
          triggerClassName="min-h-[30px]"
          value={sort}
        />
      </div>
      <div className="min-w-0">
        <DataTable
          bordered={false}
          ariaLabel={t("title")}
          columns={byMarketTableColumns(t)}
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
