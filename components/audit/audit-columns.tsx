import { Avatar } from "@/components/ui/Avatar";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { StatusPill } from "@/components/ui/StatusPill";
import type { AuditEntry, AuditStatus } from "@/lib/queries/audit";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
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

type AuditColumnsOptions = {
  onOpenEntry: (entry: AuditEntry) => void;
};

function ActorEventCell({
  onOpenEntry,
  row,
}: Readonly<{ onOpenEntry: AuditColumnsOptions["onOpenEntry"]; row: AuditEntry }>) {
  return (
    <span className="flex h-full min-w-0 items-center gap-2.5 py-1">
      <Avatar
        alt=""
        className="grid h-[26px] w-[26px] shrink-0 place-items-center rounded-control bg-bg-sunken text-[9.5px] font-semibold text-fg-muted"
        initials={row.actor.initials}
        src={row.actor.avatarUrl}
      />
      <span className="min-w-0">
        <button
          aria-label={`Open audit event ${row.eventName}`}
          className="block max-w-full truncate text-left text-[12.5px] font-medium leading-[1.25] text-fg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent-solid"
          onClick={(event) => {
            event.stopPropagation();
            onOpenEntry(row);
          }}
          type="button"
        >
          {row.eventName}
        </button>
        <span className="mt-0.5 block truncate text-[10px] leading-[1.2] text-fg-muted">
          {row.actor.email} / {row.source.channel.toUpperCase()}
        </span>
      </span>
    </span>
  );
}

function ResourceCell({ row }: Readonly<{ row: AuditEntry }>) {
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

function StatusCell({ status }: Readonly<{ status: AuditStatus }>) {
  return (
    <span className="flex w-full items-center justify-between gap-2">
      <StatusPill size="sm" status={status} />
      <CaretRight aria-hidden className="shrink-0 text-fg-muted" size={12} weight="regular" />
    </span>
  );
}

export function auditColumns({ onOpenEntry }: Readonly<AuditColumnsOptions>) {
  return [
    {
      accessorKey: "timestamp",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[11.5px] tabular-nums text-fg-muted">
          {row.original.timestampLabel}
        </span>
      ),
      header: "Timestamp",
      id: "timestamp",
      meta: { title: "Timestamp" },
      minSize: 172,
      size: 200,
      sortDescFirst: true,
    },
    {
      accessorFn: (row: AuditEntry) => `${row.actor.email} ${row.eventName}`,
      cell: ({ row }) => <ActorEventCell onOpenEntry={onOpenEntry} row={row.original} />,
      header: "Actor / Event",
      id: "eventName",
      meta: { flex: 1.4, title: "Actor / Event" },
      minSize: 232,
      size: 272,
    },
    {
      accessorFn: (row: AuditEntry) =>
        `${row.resource.type} ${row.resource.id ?? ""} ${row.resource.name}`,
      cell: ({ row }) => <ResourceCell row={row.original} />,
      header: "Resource",
      id: "resource",
      meta: { flex: 1.6, title: "Resource" },
      minSize: 240,
      size: 280,
    },
    {
      accessorKey: "operation",
      cell: ({ row }) => <OperationPill operation={row.original.operation} />,
      header: "Operation",
      id: "operation",
      meta: { title: "Operation" },
      minSize: 112,
      size: 120,
    },
    {
      accessorKey: "status",
      cell: ({ row }) => <StatusCell status={row.original.status} />,
      header: "Status",
      id: "status",
      meta: { title: "Status" },
      minSize: 112,
      size: 120,
    },
  ] satisfies DataTableColumn<AuditEntry>[];
}
