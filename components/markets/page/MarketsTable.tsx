"use client";

import { MarketsRowMenu } from "@/components/markets/page/MarketsRowMenu";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatusChip } from "@/components/ui/StatusChip";
import { Switch } from "@/components/ui/Switch";
import { formatMoneyCents } from "@/lib/format/money";
import {
  type MarketsPageRow,
  type MarketsSortKey,
  marketMetric,
  sortMarkets,
} from "@/lib/markets/page-model";
import { asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import { actionErrorMessage } from "@/lib/ui/action-error";
import Link from "next/link";
import { type ReactElement, useRef, useState } from "react";

type MarketsTableProps = {
  canAddKeywords: boolean;
  canArchive: boolean;
  canEdit: boolean;
  onAddKeywords?: (market: MarketsPageRow) => void;
  onArchive: (market: MarketsPageRow) => void;
  onEdit: (market: MarketsPageRow) => void;
  onStatusChange: (input: { enabled: boolean; marketId: string }) => Promise<{ status: string }>;
  onStatusConfirmed: () => void;
  projectId: string;
  rows: readonly MarketsPageRow[];
  title: string;
};

function statusLabel(status: MarketsPageRow["status"]) {
  return status === "active" ? "Active" : "Paused";
}

export function MarketsTable({
  canAddKeywords,
  canArchive,
  canEdit,
  onAddKeywords,
  onArchive,
  onEdit,
  onStatusChange,
  onStatusConfirmed,
  projectId,
  rows,
  title,
}: Readonly<MarketsTableProps>) {
  const [error, setError] = useState<string | null>(null);
  const [sortKey, setSortKey] = useState<MarketsSortKey>("name");
  const [statuses, setStatuses] = useState(() => new Map(rows.map((row) => [row.id, row.status])));
  const confirmed = useRef(new Map(rows.map((row) => [row.id, row.status])));
  const queues = useRef(new Map<string, Promise<void>>());
  const revisions = useRef(new Map<string, number>());
  const sortedRows = sortMarkets(rows, sortKey);

  function sortableHeader(label: string, key: MarketsSortKey) {
    return (
      <button
        aria-pressed={sortKey === key}
        className="font-inherit text-inherit hover:text-fg focus-visible:text-fg"
        onClick={() => setSortKey(key)}
        type="button"
      >
        {label}
      </button>
    );
  }

  function queueStatusChange(market: MarketsPageRow, enabled: boolean) {
    if (!canEdit) return;
    const nextStatus = enabled ? "active" : "paused";
    const revision = (revisions.current.get(market.id) ?? 0) + 1;
    revisions.current.set(market.id, revision);
    setStatuses((current) => new Map(current).set(market.id, nextStatus));
    const save = async () => {
      if (revisions.current.get(market.id) !== revision) return;
      setError(null);
      try {
        const updated = await onStatusChange({ enabled, marketId: market.id });
        confirmed.current.set(market.id, updated.status as MarketsPageRow["status"]);
        if (revisions.current.get(market.id) === revision) {
          setStatuses((current) =>
            new Map(current).set(market.id, updated.status as MarketsPageRow["status"]),
          );
          onStatusConfirmed();
        }
      } catch (cause) {
        revisions.current.set(market.id, (revisions.current.get(market.id) ?? revision) + 1);
        setStatuses((current) =>
          new Map(current).set(market.id, confirmed.current.get(market.id) ?? market.status),
        );
        setError(actionErrorMessage(cause, "Market status could not be updated."));
        onStatusConfirmed();
      }
    };
    const previous = queues.current.get(market.id) ?? Promise.resolve();
    const queued = previous.then(save, save);
    queues.current.set(market.id, queued);
  }

  return (
    <section
      aria-label={title}
      className="overflow-hidden rounded-card border border-border bg-bg-elev"
    >
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h2 className="m-0 text-[14px] font-semibold text-fg">{title}</h2>
        <span className="text-[12px] text-fg-muted">{rows.length}</span>
      </div>
      <div className="min-w-0">
        <DataTable
          ariaLabel={title}
          bordered={false}
          columns={marketTableColumns({
            canAddKeywords,
            canArchive,
            canEdit,
            onAddKeywords,
            onArchive,
            onEdit,
            onStatusChange: queueStatusChange,
            projectId,
            sortableHeader,
            statuses,
          })}
          density="standard"
          emptyState={
            <EmptyState
              compact
              description="Resume a paused market to start tracking again."
              title="No active markets"
            />
          }
          id="markets-table"
          layout="auto"
          onSortingChange={() => undefined}
          rowClassName={() => "hover:bg-bg-sunken"}
          rows={sortedRows}
          sorting={null}
        />
      </div>
      {error ? (
        <p className="m-0 border-t border-border px-4 py-2 text-[12px] text-red-text">{error}</p>
      ) : null}
    </section>
  );
}

type MarketTableColumnsOptions = {
  canAddKeywords: boolean;
  canArchive: boolean;
  canEdit: boolean;
  onAddKeywords?: (market: MarketsPageRow) => void;
  onArchive: (market: MarketsPageRow) => void;
  onEdit: (market: MarketsPageRow) => void;
  onStatusChange: (market: MarketsPageRow, enabled: boolean) => void;
  projectId: string;
  sortableHeader: (label: string, key: MarketsSortKey) => ReactElement;
  statuses: Map<string, MarketsPageRow["status"]>;
};

function marketTableColumns({
  canAddKeywords,
  canArchive,
  canEdit,
  onAddKeywords,
  onArchive,
  onEdit,
  onStatusChange,
  projectId,
  sortableHeader,
  statuses,
}: Readonly<MarketTableColumnsOptions>): readonly DataTableColumn<MarketsPageRow>[] {
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            className="font-medium text-fg hover:text-accent-text"
            href={marketPath(asProjectRef(projectId), asMarketRef(row.original.id), "rank-tracker")}
          >
            {row.original.name}
          </Link>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
            {row.original.displayName} / {row.original.languageLabel}
          </p>
        </div>
      ),
      enableSorting: false,
      header: () => sortableHeader("Market", "name"),
      id: "name",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: "Market" },
      minSize: 240,
      size: 272,
    },
    {
      accessorKey: "keywordCount",
      cell: ({ row }) => row.original.keywordCount,
      enableSorting: false,
      header: () => sortableHeader("Keywords", "keywordCount"),
      id: "keywordCount",
      meta: { align: "end", lockResize: true, sortable: false, title: "Keywords" },
      minSize: 92,
      size: 100,
    },
    {
      accessorKey: "currentVisibility",
      cell: ({ row }) =>
        row.original.currentVisibility == null ? "-" : `${row.original.currentVisibility}%`,
      enableSorting: false,
      header: () => sortableHeader("Visibility", "currentVisibility"),
      id: "currentVisibility",
      meta: { align: "end", lockResize: true, sortable: false, title: "Visibility" },
      minSize: 104,
      size: 112,
    },
    {
      accessorKey: "topThreeCount",
      cell: ({ row }) => marketMetric(row.original.topThreeCount),
      enableSorting: false,
      header: "Top 3",
      id: "topThreeCount",
      meta: { align: "end", lockResize: true, sortable: false, title: "Top 3" },
      minSize: 72,
      size: 80,
    },
    {
      accessorKey: "monthlyCostCents",
      cell: ({ row }) =>
        row.original.monthlyCostCents == null
          ? "-"
          : formatMoneyCents(row.original.monthlyCostCents),
      enableSorting: false,
      header: () => sortableHeader("Monthly cost", "monthlyCostCents"),
      id: "monthlyCostCents",
      meta: { align: "end", lockResize: true, sortable: false, title: "Monthly cost" },
      minSize: 128,
      size: 136,
    },
    {
      cell: ({ row }) => {
        const status = statuses.get(row.original.id) ?? row.original.status;
        const active = status === "active";
        return (
          <div className="flex items-center gap-2">
            <Switch
              aria-label={`${active ? "Pause" : "Resume"} ${row.original.name}`}
              checked={active}
              className="border-0 bg-transparent p-0"
              disabled={!canEdit}
              onChange={(event) => onStatusChange(row.original, event.currentTarget.checked)}
            />
            <StatusChip label={statusLabel(status)} tone={active ? "positive" : "neutral"} />
          </div>
        );
      },
      enableSorting: false,
      header: "Status",
      id: "status",
      meta: { lockResize: true, sortable: false, title: "Status" },
      minSize: 152,
      size: 160,
    },
    {
      cell: ({ row }) => (
        <MarketsRowMenu
          canAddKeywords={canAddKeywords}
          canArchive={canArchive}
          canEdit={canEdit}
          market={row.original}
          onAddKeywords={onAddKeywords}
          onArchive={onArchive}
          onEdit={onEdit}
        />
      ),
      enableSorting: false,
      header: "",
      id: "actions",
      meta: { align: "end", lockResize: true, sortable: false, title: "Actions" },
      minSize: 48,
      size: 56,
    },
  ];
}
