import { createElement } from "react";
import type { DataTableColumn, DataTableRowBase } from "./data-table-types";

export type DataTableStoryRow = DataTableRowBase & {
  clicks: number;
  ctr: number;
  device: "Desktop" | "Mobile" | "Mixed";
  impressions: number;
  keyword: string;
  position: number;
  selectable?: boolean;
  volume: number;
};

function leaf(
  id: string,
  keyword: string,
  position: number,
  volume: number,
  device: DataTableStoryRow["device"] = "Desktop",
): DataTableStoryRow {
  const impressions = volume * 3;
  const clicks = Math.round(impressions / Math.max(position * 2, 1));
  return {
    clicks,
    ctr: Number(((clicks / impressions) * 100).toFixed(1)),
    device,
    id,
    impressions,
    keyword,
    position,
    volume,
  };
}

export const dataTableStoryRows: readonly DataTableStoryRow[] = [
  {
    ...leaf("section-priority", "Priority markets", 0, 0, "Mixed"),
    kind: "section",
    subRows: [
      leaf("leaf-audit", "technical seo audit", 4, 2_400),
      leaf("leaf-monitor", "rank monitoring", 11, 1_900, "Mobile"),
    ],
  },
  {
    ...leaf("group-monitoring", "Monitoring group", 8, 8_400, "Mixed"),
    kind: "group",
    subRows: [
      leaf("leaf-open", "open source rank tracker", 3, 3_600),
      leaf("leaf-local", "local rank tracker", 8, 2_900, "Mobile"),
      leaf("leaf-agency", "agency serp monitor", 13, 1_900),
    ],
  },
  leaf("leaf-standalone", "search visibility report", 6, 1_600),
  { ...leaf("leaf-archived", "archived comparison", 22, 720), selectable: false },
];

export const stableSortStoryRows: readonly DataTableStoryRow[] = [
  leaf("stable-one", "First result", 1, 500),
  leaf("stable-two-a", "Earlier equal result", 2, 800),
  leaf("stable-two-b", "Later equal result", 2, 600),
];

export const clientPaginationStoryRows: readonly DataTableStoryRow[] = Array.from(
  { length: 12 },
  (_, index) => leaf(`client-page-${index + 1}`, `Client row ${index + 1}`, index + 1, 500 + index),
);

function storyLink(row: DataTableStoryRow) {
  return createElement(
    "a",
    {
      className: "truncate font-medium text-fg hover:underline",
      href: `#story-row-${row.id}`,
      onClick: (event: MouseEvent) => event.preventDefault(),
    },
    row.keyword,
  );
}

export const dataTableStoryColumns: readonly DataTableColumn<DataTableStoryRow>[] = [
  {
    accessorKey: "keyword",
    cell: ({ row }) => storyLink(row.original),
    header: "Keyword",
    id: "keyword",
    meta: { flex: 1, lockVisible: true, pin: "left", title: "Keyword" },
    minSize: 160,
    size: 240,
  },
  {
    accessorKey: "position",
    header: "Position",
    id: "position",
    meta: { align: "end", title: "Position" },
    size: 96,
  },
  {
    accessorKey: "device",
    header: "Device",
    id: "device",
    meta: { sortable: ({ grouped }) => !grouped, title: "Device" },
    size: 112,
  },
  {
    accessorKey: "volume",
    header: "Volume",
    id: "volume",
    meta: { align: "end", title: "Volume" },
    size: 108,
    sortDescFirst: true,
  },
  {
    accessorKey: "clicks",
    header: "Clicks",
    id: "clicks",
    meta: { align: "end", title: "Clicks" },
    size: 100,
    sortDescFirst: true,
  },
  {
    accessorKey: "impressions",
    header: "Impressions",
    id: "impressions",
    meta: { align: "end", title: "Impressions" },
    size: 128,
    sortDescFirst: true,
  },
  {
    accessorKey: "ctr",
    cell: ({ getValue }) => `${getValue<number>()}%`,
    header: "CTR",
    id: "ctr",
    meta: { align: "end", title: "CTR" },
    size: 88,
    sortDescFirst: true,
  },
  {
    cell: ({ row }) =>
      createElement(
        "button",
        { "aria-label": `Open actions for ${row.original.keyword}`, type: "button" },
        "More",
      ),
    header: "Actions",
    id: "actions",
    meta: { align: "end", lockResize: true, lockVisible: true, pin: "right", title: "Actions" },
    size: 84,
  },
];

export const fixedResizeStoryColumns: readonly DataTableColumn<DataTableStoryRow>[] =
  dataTableStoryColumns.map((column) =>
    column.id === "keyword" ? { ...column, meta: { ...column.meta, flex: undefined } } : column,
  );

export function createPerformanceStoryRows(
  groupCount = 1_000,
  leavesPerGroup = 10,
): readonly DataTableStoryRow[] {
  return Array.from({ length: groupCount }, (_, groupIndex) => {
    const subRows = Array.from({ length: leavesPerGroup }, (_, leafIndex) =>
      leaf(
        `perf-${groupIndex}-${leafIndex}`,
        `tracked phrase ${groupIndex * leavesPerGroup + leafIndex + 1}`,
        ((groupIndex + leafIndex) % 100) + 1,
        200 + ((groupIndex * 37 + leafIndex * 13) % 9_800),
        leafIndex % 2 === 0 ? "Desktop" : "Mobile",
      ),
    );
    const clicks = subRows.reduce((sum, row) => sum + row.clicks, 0);
    const impressions = subRows.reduce((sum, row) => sum + row.impressions, 0);
    return {
      ...leaf(`perf-group-${groupIndex}`, `Group ${groupIndex + 1}`, 1, 0, "Mixed"),
      clicks,
      ctr: Number(((clicks / impressions) * 100).toFixed(1)),
      impressions,
      kind: "group" as const,
      subRows,
      volume: subRows.reduce((sum, row) => sum + row.volume, 0),
    };
  });
}
