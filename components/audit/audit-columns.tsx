import { Avatar } from "@/components/ui/Avatar";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { IdChip } from "@/components/ui/IdChip";
import { StatusPill } from "@/components/ui/StatusPill";
import type { AuditStatus } from "@/lib/queries/audit";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { useTranslations } from "next-intl";
import type { PresentedAuditEntry } from "./audit-presentation";
import { OperationPill } from "./OperationPill";

type AuditColumnsTranslations = ReturnType<typeof useTranslations<"projectAudit.columns">>;

type AuditColumnsOptions = {
  onOpenEntry: (entry: PresentedAuditEntry) => void;
  t: AuditColumnsTranslations;
};

function resourceLabel(type: PresentedAuditEntry["resource"]["type"], t: AuditColumnsTranslations) {
  switch (type) {
    case "api_key":
      return t("resourceApiKey");
    case "auth_session":
      return t("resourceSession");
    case "export":
      return t("resourceExport");
    case "keyword":
      return t("resourceKeyword");
    case "project":
      return t("resourceProject");
    case "provider":
      return t("resourceProvider");
    case "team":
      return t("resourceTeam");
  }
}

function ActorEventCell({
  onOpenEntry,
  row,
  t,
}: Readonly<{
  onOpenEntry: AuditColumnsOptions["onOpenEntry"];
  row: PresentedAuditEntry;
  t: AuditColumnsTranslations;
}>) {
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
          aria-label={t("openEntry", { eventName: row.eventName })}
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

function ResourceCell({
  row,
  t,
}: Readonly<{ row: PresentedAuditEntry; t: AuditColumnsTranslations }>) {
  return (
    <span className="flex h-full min-w-0 flex-col justify-center gap-1 py-1">
      <span className="truncate text-[12px] font-medium leading-[1.2] text-fg">
        {resourceLabel(row.resource.type, t)}
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

export function auditColumns({ onOpenEntry, t }: Readonly<AuditColumnsOptions>) {
  return [
    {
      accessorKey: "timestamp",
      cell: ({ row }) => (
        <span className="whitespace-nowrap text-[11.5px] tabular-nums text-fg-muted">
          {row.original.timestampLabel}
        </span>
      ),
      header: t("timestamp"),
      id: "timestamp",
      meta: { title: t("timestamp") },
      minSize: 172,
      size: 200,
      sortDescFirst: true,
    },
    {
      accessorFn: (row: PresentedAuditEntry) => `${row.actor.email} ${row.eventName}`,
      cell: ({ row }) => <ActorEventCell onOpenEntry={onOpenEntry} row={row.original} t={t} />,
      header: t("actorEvent"),
      id: "eventName",
      meta: { flex: 1.4, title: t("actorEvent") },
      minSize: 232,
      size: 272,
    },
    {
      accessorFn: (row: PresentedAuditEntry) =>
        `${row.resource.type} ${row.resource.id ?? ""} ${row.resource.name}`,
      cell: ({ row }) => <ResourceCell row={row.original} t={t} />,
      header: t("resource"),
      id: "resource",
      meta: { flex: 1.6, title: t("resource") },
      minSize: 240,
      size: 280,
    },
    {
      accessorKey: "operation",
      cell: ({ row }) => <OperationPill operation={row.original.operation} />,
      header: t("operation"),
      id: "operation",
      meta: { title: t("operation") },
      minSize: 112,
      size: 120,
    },
    {
      accessorKey: "status",
      cell: ({ row }) => <StatusCell status={row.original.status} />,
      header: t("status"),
      id: "status",
      meta: { title: t("status") },
      minSize: 112,
      size: 120,
    },
  ] satisfies DataTableColumn<PresentedAuditEntry>[];
}
