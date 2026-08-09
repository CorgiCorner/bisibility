import { IdChip } from "@/components/ui";
import type { AuditEntry, AuditStatus } from "@/lib/queries/audit";
import type { GridColDef, GridRenderCellParams } from "@mui/x-data-grid";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react";
import { OperationPill } from "./OperationPill";

const RESOURCE_TYPE_LABELS: Record<AuditEntry["resource"]["type"], string> = {
  api_key: "API key",
  auth_session: "Session",
  export: "Export",
  keyword: "Keyword",
  project: "Project",
  provider: "Provider",
  team: "Team",
};

function ActorEventCell({ row }: Readonly<GridRenderCellParams<AuditEntry>>) {
  return (
    <span className="flex h-full min-w-0 items-center gap-2.5 py-1">
      <span className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-[7px] bg-bg-sunken font-mono text-[9.5px] font-semibold text-fg-muted">
        {row.actor.initials}
      </span>
      <span className="min-w-0">
        <span className="block truncate text-[12.5px] font-medium leading-[1.25] text-fg">
          {row.eventName}
        </span>
        <span className="mt-0.5 block truncate font-mono text-[10px] leading-[1.2] text-fg-muted">
          {row.actor.email} / {row.source.channel.toUpperCase()}
        </span>
      </span>
    </span>
  );
}

function ResourceCell({ row }: Readonly<GridRenderCellParams<AuditEntry>>) {
  return (
    <span className="flex h-full min-w-0 flex-col justify-center gap-1 py-1">
      <span className="truncate text-[12px] font-medium leading-[1.2] text-fg">
        {RESOURCE_TYPE_LABELS[row.resource.type]}
      </span>
      {row.resource.id ? (
        <IdChip className="border-0 bg-transparent px-0" size="sm" value={row.resource.id} />
      ) : null}
    </span>
  );
}

function StatusChip({ status }: Readonly<{ status: AuditStatus }>) {
  const color = status === "success" ? "var(--green)" : "var(--red)";
  const label = status === "success" ? "Success" : "Failed";
  return (
    <span
      className="inline-flex rounded-full px-2 py-0.5 font-mono text-[10px] font-semibold leading-none"
      style={{
        backgroundColor: `color-mix(in srgb, ${color} 14%, transparent)`,
        color,
      }}
    >
      {label}
    </span>
  );
}

function StatusCell({ status }: Readonly<{ status: AuditStatus }>) {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <StatusChip status={status} />
      <CaretRight aria-hidden className="shrink-0 text-fg-muted" size={12} />
    </span>
  );
}

export const auditColumns: GridColDef<AuditEntry>[] = [
  {
    field: "timestamp",
    headerName: "Timestamp",
    // "2026-06-19 14:42:08 UTC" is 23 mono chars: ~159px at 11.5px plus the grid cell's
    // 10px side padding leaves no slack at the design's 170px, so widen rather than clip.
    width: 198,
    renderCell: ({ row }) => (
      <span className="whitespace-nowrap font-mono text-[11.5px] text-fg-muted">
        {row.timestampLabel}
      </span>
    ),
  },
  {
    field: "eventName",
    flex: 1.4,
    headerName: "Actor / Event",
    minWidth: 230,
    renderCell: ActorEventCell,
    valueGetter: (_value, row) => `${row.actor.email} ${row.eventName}`,
  },
  {
    field: "resource",
    flex: 1.6,
    headerName: "Resource",
    minWidth: 240,
    renderCell: ResourceCell,
    valueGetter: (_value, row) => `${row.resource.type} ${row.resource.id} ${row.resource.name}`,
  },
  {
    field: "operation",
    headerName: "Operation",
    minWidth: 110,
    renderCell: ({ row }) => <OperationPill operation={row.operation} />,
  },
  {
    field: "status",
    headerName: "Status",
    minWidth: 110,
    renderCell: ({ row }) => <StatusCell status={row.status} />,
  },
];
