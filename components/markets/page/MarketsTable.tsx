"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import { EmptyState } from "@/components/ui/EmptyState";
import { type MarketsPageRow, type MarketsSortKey, sortMarkets } from "@/lib/markets/page-model";
import { actionErrorMessage } from "@/lib/ui/action-error";
import { useFormatter, useTranslations } from "next-intl";
import { useRef, useState } from "react";
import { marketTableColumns } from "./market-table-columns";

type MarketsTableProps = {
  canAddKeywords: boolean;
  canArchive: boolean;
  canEdit: boolean;
  canRunChecks?: boolean;
  onRunChecks?: (market: MarketsPageRow) => void;
  onAddKeywords?: (market: MarketsPageRow) => void;
  onArchive: (market: MarketsPageRow) => void;
  onEdit: (market: MarketsPageRow) => void;
  onStatusChange: (input: { enabled: boolean; marketId: string }) => Promise<{ status: string }>;
  onStatusConfirmed: () => void;
  projectId: string;
  rows: readonly MarketsPageRow[];
  title: string;
};

export function MarketsTable({
  canAddKeywords,
  canArchive,
  canEdit,
  canRunChecks = false,
  onRunChecks,
  onAddKeywords,
  onArchive,
  onEdit,
  onStatusChange,
  onStatusConfirmed,
  projectId,
  rows,
  title,
}: Readonly<MarketsTableProps>) {
  const format = useFormatter();
  const t = useTranslations("projectMarkets");
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
        setError(actionErrorMessage(cause, t("updateFailed")));
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
      <div className="flex items-center justify-between px-4 py-3">
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
            canRunChecks,
            onRunChecks,
            onAddKeywords,
            onArchive,
            onEdit,
            onStatusChange: queueStatusChange,
            projectId,
            sortableHeader,
            statuses,
            format,
            t,
          })}
          density="standard"
          emptyState={
            <EmptyState compact description={t("resumePausedHint")} title={t("noActiveMarkets")} />
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
