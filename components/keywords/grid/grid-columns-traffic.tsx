import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";

const noDataClassName = "font-sans tabular-nums text-xs font-semibold text-fg-muted";

function TrafficNoDataValue({ label }: Readonly<{ label: string }>) {
  return (
    <Tooltip content={label}>
      <span aria-label={label} className={noDataClassName}>
        -
      </span>
    </Tooltip>
  );
}

function TrafficNumberCell({
  formatNumber,
  noTrafficDataLabel,
  value,
}: Readonly<{
  formatNumber: (value: number) => string;
  noTrafficDataLabel: string;
  value: number | null | undefined;
}>) {
  if (value == null) return <TrafficNoDataValue label={noTrafficDataLabel} />;
  return <span data-analytics-block>{formatNumber(value)}</span>;
}

function CtrCell({
  formatPercent,
  noTrafficDataLabel,
  value,
}: Readonly<{
  formatPercent: (value: number) => string;
  noTrafficDataLabel: string;
  value: number | null | undefined;
}>) {
  if (value == null) return <TrafficNoDataValue label={noTrafficDataLabel} />;
  return <span data-analytics-block>{formatPercent(value)}</span>;
}

export type TrafficColumnLabels = {
  clickThroughRate: string;
  clicks: string;
  ctr: string;
  formatNumber: (value: number) => string;
  formatPercent: (value: number) => string;
  impressions: string;
  noTrafficDataLabel: string;
};

export function trafficColumns({
  clickThroughRate,
  clicks,
  ctr,
  formatNumber,
  formatPercent,
  impressions,
  noTrafficDataLabel,
}: TrafficColumnLabels): DataTableColumn<KeywordRow>[] {
  return [
    {
      accessorFn: (row) => row.clicks,
      cell: ({ getValue }) => (
        <TrafficNumberCell
          formatNumber={formatNumber}
          noTrafficDataLabel={noTrafficDataLabel}
          value={getValue() as number | null | undefined}
        />
      ),
      header: clicks,
      id: "clicks",
      meta: { align: "end", title: clicks },
      minSize: 96,
      size: 96,
      sortDescFirst: true,
    },
    {
      accessorFn: (row) => row.impressions,
      cell: ({ getValue }) => (
        <TrafficNumberCell
          formatNumber={formatNumber}
          noTrafficDataLabel={noTrafficDataLabel}
          value={getValue() as number | null | undefined}
        />
      ),
      header: impressions,
      id: "impressions",
      meta: { align: "end", title: impressions },
      minSize: 96,
      size: 96,
      sortDescFirst: true,
    },
    {
      accessorFn: (row) => row.ctr,
      cell: ({ getValue }) => (
        <CtrCell
          formatPercent={formatPercent}
          noTrafficDataLabel={noTrafficDataLabel}
          value={getValue() as number | null | undefined}
        />
      ),
      header: ctr,
      id: "ctr",
      meta: { align: "end", title: clickThroughRate },
      minSize: 92,
      size: 92,
      sortDescFirst: true,
    },
  ];
}
