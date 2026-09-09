import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip } from "@/components/ui/StatusChip";
import { itemStatusChipPresentation } from "@/components/ui/status-chip-mapping";
import { deviceLabel } from "@/lib/queries/keyword-row-format";
import { isUnrunnableReason } from "@/lib/rank-check/runnable-reasons";
import {
  blockedRunPresentation,
  type ClientDeploymentMode,
} from "@/lib/rank-check/runs/blocked-presentation";
import { appPath, type ProjectRef } from "@/lib/routing/app-path";
import Link from "next/link";
import type { RunPageData, RunPageItem } from "./RunPageTypes";

type RunTargetTableColumnsOptions = {
  deploymentMode: ClientDeploymentMode;
  projectRef: ProjectRef;
  run: RunPageData;
  showNotes: boolean;
};

function money(value: number | null): string {
  if (value === null) return "-";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(value / 100);
}

export function runTargetNote(
  item: RunPageItem,
  run: RunPageData,
  deploymentMode: ClientDeploymentMode,
) {
  if (isUnrunnableReason(item.blockedReason)) {
    return blockedRunPresentation({ deploymentMode, reason: item.blockedReason }).compact;
  }
  if (item.status === "skipped" || item.status === "blocked") {
    return item.blockedReason ?? "Skipped before start";
  }
  if (run.status === "blocked" && item.status === "queued") {
    return blockedRunPresentation({
      budget: run.budget,
      deploymentMode,
      reason: run.blockedReason,
    }).compact;
  }
  return item.rankCheck?.errorCode ?? "";
}

export function runTargetTableColumns({
  deploymentMode,
  projectRef,
  run,
  showNotes,
}: RunTargetTableColumnsOptions): readonly DataTableColumn<RunPageItem>[] {
  const columns: DataTableColumn<RunPageItem>[] = [
    {
      accessorFn: (item) => item.keyword.text,
      cell: ({ row }) => (
        <Link
          className="block truncate font-semibold text-fg no-underline hover:text-accent-text"
          href={appPath(projectRef, "rank-tracker", row.original.keyword.publicId)}
        >
          {row.original.keyword.text}
        </Link>
      ),
      enableSorting: false,
      header: "Keyword",
      id: "keyword",
      meta: { flex: 1.4, lockResize: true, title: "Keyword" },
      minSize: 192,
      size: 248,
    },
    {
      accessorFn: (item) => item.status,
      cell: ({ row }) => {
        const status = itemStatusChipPresentation(
          run.status === "blocked" && row.original.status === "queued"
            ? "blocked"
            : row.original.status,
        );
        return <StatusChip label={status.label} tone={status.tone} />;
      },
      enableSorting: false,
      header: "Status",
      id: "status",
      meta: { lockResize: true, title: "Status" },
      minSize: 112,
      size: 120,
    },
    {
      accessorFn: (item) => `${item.keyword.location} ${item.keyword.languageLabel ?? ""}`,
      cell: ({ row }) => (
        <span className="font-semibold text-fg">
          {row.original.keyword.location}
          {row.original.keyword.languageLabel ? ` / ${row.original.keyword.languageLabel}` : ""}
        </span>
      ),
      enableSorting: false,
      header: "Market",
      id: "market",
      meta: { flex: 0.6, lockResize: true, title: "Market" },
      minSize: 168,
      size: 184,
    },
    {
      accessorFn: (item) => deviceLabel(item.keyword.device),
      cell: ({ row }) => deviceLabel(row.original.keyword.device),
      enableSorting: false,
      header: "Device",
      id: "device",
      meta: { lockResize: true, title: "Device" },
      minSize: 100,
      size: 108,
    },
    {
      accessorFn: (item) => item.rankCheck?.position ?? null,
      cell: ({ row }) => row.original.rankCheck?.position ?? "-",
      enableSorting: false,
      header: "Position",
      id: "position",
      meta: { align: "end", lockResize: true, title: "Position" },
      minSize: 104,
      size: 112,
    },
    {
      accessorFn: (item) => item.actualCostCents ?? item.estimatedCostCents,
      cell: ({ row }) => money(row.original.actualCostCents ?? row.original.estimatedCostCents),
      enableSorting: false,
      header: "Cost",
      id: "cost",
      meta: { align: "end", lockResize: true, title: "Cost" },
      minSize: 88,
      size: 96,
    },
  ];
  if (showNotes) {
    columns.push({
      accessorFn: (item) => runTargetNote(item, run, deploymentMode),
      cell: ({ row }) => {
        const itemNote = runTargetNote(row.original, run, deploymentMode);
        return (
          <span className="block truncate text-[11.5px] text-fg-muted" title={itemNote}>
            {itemNote}
          </span>
        );
      },
      enableSorting: false,
      header: "Note",
      id: "note",
      meta: { flex: 0.9, lockResize: true, title: "Note" },
      minSize: 176,
      size: 200,
    });
  }
  return columns;
}
