"use client";

import { SettingsCard } from "@/components/settings/shell/SettingsCard";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { formatCount, formatRevenue } from "@/lib/conversions/format";
import type { ComparisonRow, ConversionSourceState } from "@/lib/conversions/types";
import { useLocale, useTranslations } from "next-intl";
import { useMemo } from "react";

type ComparisonTableRow = ComparisonRow & { id: string };

function cellText(
  cell: ComparisonRow["cells"][number] | undefined,
  locale: string,
  notReported: string,
) {
  if (!cell || cell.count === null) return notReported;
  const count = formatCount(cell.count, locale);
  if (!cell.revenueMinor || !cell.currency) return count;
  return `${count} ${formatRevenue(cell.revenueMinor, cell.currency, locale)}`;
}

export function ConversionComparisonCard({
  rows,
  sources,
}: Readonly<{
  rows: ComparisonRow[];
  sources: ConversionSourceState[];
}>) {
  const t = useTranslations("projectSettingsConversions");
  const locale = useLocale();
  const connected = sources.filter((source) => source.connected);
  const tableRows = rows.map((row) => ({ ...row, id: row.displayName }));
  const columns = useMemo<DataTableColumn<ComparisonTableRow>[]>(
    () => [
      {
        accessorKey: "displayName",
        header: t("comparison.goal"),
        id: "goal",
        meta: { flex: 1, title: t("comparison.goal") },
        minSize: 140,
        size: 180,
      },
      ...connected.map((source) => {
        const header = source.primary
          ? `${source.label} (${t("comparison.primary")})`
          : source.label;
        return {
          cell: ({ row }: { row: { original: ComparisonTableRow } }) =>
            cellText(
              row.original.cells.find((item) => item.source === source.source),
              locale,
              t("comparison.notReported"),
            ),
          header,
          id: source.source,
          meta: { flex: 1, title: header },
          minSize: 180,
          size: 220,
        };
      }),
    ],
    [connected, locale, t],
  );

  return (
    <SettingsCard
      description={t("comparison.description")}
      showSave={false}
      title={t("comparison.title")}
    >
      <DataTable
        ariaLabel={t("comparison.tableLabel")}
        bordered={false}
        columns={columns}
        density="compact"
        emptyState={<p className="m-0 text-sm text-fg-muted">{t("comparison.empty")}</p>}
        id="conversion-source-comparison"
        onSortingChange={() => undefined}
        rows={tableRows}
        sorting={null}
      />
    </SettingsCard>
  );
}
