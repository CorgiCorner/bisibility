import { dataLinkClassName } from "@/components/ui/data-link-styles";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { MarketsPageRow, MarketsSortKey } from "@/lib/markets/page-model";
import { asMarketRef, asProjectRef, marketPath } from "@/lib/routing/app-path";
import Link from "next/link";
import type { useFormatter, useTranslations } from "next-intl";
import type { ReactElement } from "react";
import { MarketsRowMenu } from "./MarketsRowMenu";
import { MarketTrackingStatus } from "./MarketTrackingStatus";

type MarketTableColumnsOptions = {
  canAddKeywords: boolean;
  canArchive: boolean;
  canEdit: boolean;
  canRunChecks?: boolean;
  onRunChecks?: (market: MarketsPageRow) => void;
  onAddKeywords?: (market: MarketsPageRow) => void;
  onAddDevice?: (market: MarketsPageRow) => void;
  onArchive: (market: MarketsPageRow) => void;
  onEdit: (market: MarketsPageRow) => void;
  onStatusChange: (market: MarketsPageRow, enabled: boolean) => void;
  projectId: string;
  sortableHeader: (label: string, key: MarketsSortKey) => ReactElement;
  statuses: Map<string, MarketsPageRow["status"]>;
  format: ReturnType<typeof useFormatter>;
  t: ReturnType<typeof useTranslations<"projectMarkets">>;
};

export function marketTableColumns({
  canAddKeywords,
  canArchive,
  canEdit,
  canRunChecks = false,
  onRunChecks,
  onAddKeywords,
  onAddDevice,
  onArchive,
  onEdit,
  onStatusChange,
  projectId,
  sortableHeader,
  statuses,
  format,
  t,
}: Readonly<MarketTableColumnsOptions>): readonly DataTableColumn<MarketsPageRow>[] {
  return [
    {
      accessorKey: "name",
      cell: ({ row }) => (
        <div className="min-w-0">
          <Link
            className={`font-medium ${dataLinkClassName}`}
            href={marketPath(asProjectRef(projectId), asMarketRef(row.original.id), "rank-tracker")}
          >
            {row.original.name}
          </Link>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
            {row.original.displayName} / {row.original.languageLabel}
          </p>
          {row.original.trackedDevices?.length ? (
            <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
              {row.original.trackedDevices.map((device) => t(device)).join(" · ")}
            </p>
          ) : null}
        </div>
      ),
      enableSorting: false,
      header: () => sortableHeader(t("market"), "name"),
      id: "name",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: t("market") },
      minSize: 240,
      size: 272,
    },
    {
      accessorKey: "keywordCount",
      cell: ({ row }) => (
        <div className="tabular-nums">
          <span>
            {format.number(row.original.distinctKeywordCount ?? row.original.keywordCount)}
          </span>
          <p className="m-0 mt-0.5 text-[11.5px] text-fg-muted">
            {t("trackedTargets", { count: row.original.activeKeywordCount })}
          </p>
        </div>
      ),
      enableSorting: false,
      header: () => sortableHeader(t("keywordCount"), "keywordCount"),
      id: "keywordCount",
      meta: { align: "end", lockResize: true, sortable: false, title: t("keywordCount") },
      minSize: 110,
      size: 120,
    },
    {
      accessorKey: "currentVisibility",
      cell: ({ row }) =>
        row.original.currentVisibility == null
          ? "-"
          : format.number(row.original.currentVisibility / 100, { style: "percent" }),
      enableSorting: false,
      header: () => sortableHeader(t("visibility"), "currentVisibility"),
      id: "currentVisibility",
      meta: { align: "end", lockResize: true, sortable: false, title: t("visibility") },
      minSize: 104,
      size: 112,
    },
    {
      accessorKey: "topThreeCount",
      cell: ({ row }) =>
        row.original.topThreeCount == null ? "-" : format.number(row.original.topThreeCount),
      enableSorting: false,
      header: t("topThree"),
      id: "topThreeCount",
      meta: { align: "end", lockResize: true, sortable: false, title: t("topThree") },
      minSize: 72,
      size: 80,
    },
    {
      cell: ({ row }) => {
        const status = statuses.get(row.original.id) ?? row.original.status;
        const active = status === "active";
        return (
          <MarketTrackingStatus
            active={active}
            canEdit={canEdit}
            name={row.original.name}
            onChange={(enabled) => onStatusChange(row.original, enabled)}
          />
        );
      },
      enableSorting: false,
      header: t("status"),
      id: "status",
      meta: { lockResize: true, sortable: false, title: t("status") },
      minSize: 112,
      size: 120,
    },
    {
      cell: ({ row }) => (
        <MarketsRowMenu
          canAddKeywords={canAddKeywords}
          canArchive={canArchive}
          canEdit={canEdit}
          canRunChecks={
            canRunChecks && (statuses.get(row.original.id) ?? row.original.status) === "active"
          }
          onRunChecks={onRunChecks}
          market={row.original}
          onAddKeywords={onAddKeywords}
          onAddDevice={
            (statuses.get(row.original.id) ?? row.original.status) === "active"
              ? onAddDevice
              : undefined
          }
          onArchive={onArchive}
          onEdit={onEdit}
        />
      ),
      enableSorting: false,
      header: "",
      id: "actions",
      meta: { align: "end", lockResize: true, sortable: false, title: t("actions") },
      minSize: 48,
      size: 56,
    },
  ];
}
