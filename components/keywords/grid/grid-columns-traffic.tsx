import { MonoText } from "@/components/ui";
import type { KeywordRow } from "@/lib/queries/keywords";
import Tooltip from "@mui/material/Tooltip";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";

const noDataClassName = "font-mono text-xs font-semibold text-fg-muted";
const trafficTooltip = "Connect Search Console to see traffic";

function TrafficNoDataValue() {
  return (
    <Tooltip title={trafficTooltip}>
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

function TrafficNumberCell({
  value,
}: Readonly<GridRenderCellParams<KeywordRow, number | null | undefined>>) {
  if (value == null) return <TrafficNoDataValue />;
  return (
    <MonoText component="span" size="lg">
      {formatCount(value)}
    </MonoText>
  );
}

function CtrCell({ value }: Readonly<GridRenderCellParams<KeywordRow, number | null | undefined>>) {
  if (value == null) return <TrafficNoDataValue />;
  return (
    <MonoText component="span" size="lg">
      {(value * 100).toFixed(1)}%
    </MonoText>
  );
}

export const trafficColumns: GridColDef<KeywordRow>[] = [
  {
    field: "clicks",
    headerName: "Clicks",
    minWidth: 94,
    renderCell: TrafficNumberCell,
    type: "number",
    valueGetter: (_value, row) => row.clicks,
  },
  {
    field: "impressions",
    headerName: "Impr.",
    minWidth: 94,
    renderCell: TrafficNumberCell,
    type: "number",
    valueGetter: (_value, row) => row.impressions,
  },
  {
    field: "ctr",
    headerName: "CTR%",
    minWidth: 90,
    renderCell: CtrCell,
    type: "number",
    valueGetter: (_value, row) => row.ctr,
  },
];
