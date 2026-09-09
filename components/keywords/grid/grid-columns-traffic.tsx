import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import type { KeywordRow } from "@/lib/queries/keywords";

const noDataClassName = "font-sans tabular-nums text-xs font-semibold text-fg-muted";
const trafficTooltip = "Connect Search Console to see traffic";

function TrafficNoDataValue() {
  return (
    <Tooltip content={trafficTooltip}>
      <span aria-label={trafficTooltip} className={noDataClassName}>
        -
      </span>
    </Tooltip>
  );
}

function formatCount(value: number) {
  if (value >= 10000) return `${(value / 1000).toFixed(0)}k`;
  if (value >= 1000) return `${(value / 1000).toFixed(1)}k`;
  return String(value);
}

function TrafficNumberCell({ value }: Readonly<{ value: number | null | undefined }>) {
  if (value == null) return <TrafficNoDataValue />;
  return <span data-analytics-block>{formatCount(value)}</span>;
}

function CtrCell({ value }: Readonly<{ value: number | null | undefined }>) {
  if (value == null) return <TrafficNoDataValue />;
  return <span data-analytics-block>{(value * 100).toFixed(1)}%</span>;
}

export const trafficColumns: DataTableColumn<KeywordRow>[] = [
  {
    accessorFn: (row) => row.clicks,
    cell: ({ getValue }) => <TrafficNumberCell value={getValue() as number | null | undefined} />,
    header: "Clicks",
    id: "clicks",
    meta: { align: "end", title: "Clicks" },
    minSize: 96,
    size: 96,
    sortDescFirst: true,
  },
  {
    accessorFn: (row) => row.impressions,
    cell: ({ getValue }) => <TrafficNumberCell value={getValue() as number | null | undefined} />,
    header: "Impr.",
    id: "impressions",
    meta: { align: "end", title: "Impressions" },
    minSize: 96,
    size: 96,
    sortDescFirst: true,
  },
  {
    accessorFn: (row) => row.ctr,
    cell: ({ getValue }) => <CtrCell value={getValue() as number | null | undefined} />,
    header: "CTR%",
    id: "ctr",
    meta: { align: "end", title: "Click-through rate" },
    minSize: 92,
    size: 92,
    sortDescFirst: true,
  },
];
