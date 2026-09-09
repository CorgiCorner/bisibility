import { Checkbox } from "@/components/ui/Checkbox";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { RankedKeywordGroup } from "./keyword-ranked-model";

export type RankedSuggestionTableRow = {
  group: RankedKeywordGroup;
  id: string;
  keyword: string;
  tracked: boolean;
};

type ColumnsOptions = {
  trackedLabel?: string;
  onToggle: (key: string) => void;
  selected: ReadonlySet<string>;
};

function KeywordCell({
  row,
  trackedLabel,
}: Readonly<{ row: RankedSuggestionTableRow; trackedLabel: string }>) {
  const { group, tracked } = row;
  return (
    <span className="min-w-0 truncate font-medium text-fg">
      {group.row.keyword}
      {group.count > 1 ? (
        <span className="ml-2 text-fg-muted">+{group.count - 1} variants</span>
      ) : null}
      {tracked ? <span className="ml-2 text-fg-muted">{trackedLabel}</span> : null}
    </span>
  );
}

function NumericCell({ value }: Readonly<{ value: number | null }>) {
  return <span>{value ?? "-"}</span>;
}

export function rankedSuggestionTableColumns({
  trackedLabel = "Already tracked",
  onToggle,
  selected,
}: Readonly<ColumnsOptions>): readonly DataTableColumn<RankedSuggestionTableRow>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          aria-label={`Select ${row.original.keyword}`}
          checked={!row.original.tracked && selected.has(row.original.id)}
          disabled={row.original.tracked}
          onChange={() => onToggle(row.original.id)}
        />
      ),
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "choose",
      maxSize: 44,
      meta: { lockResize: true, lockVisible: true, title: "Select keyword" },
      minSize: 44,
      size: 44,
    },
    {
      accessorKey: "keyword",
      cell: ({ row }) => <KeywordCell row={row.original} trackedLabel={trackedLabel} />,
      enableSorting: false,
      header: "Keyword",
      id: "keyword",
      meta: { flex: 1, lockVisible: true, sortable: false, title: "Keyword" },
      minSize: 160,
      size: 220,
    },
    {
      accessorFn: (row) => row.group.row.position,
      cell: ({ row }) => <NumericCell value={row.original.group.row.position} />,
      enableSorting: false,
      header: "Position",
      id: "position",
      meta: { sortable: false, title: "Position" },
      minSize: 96,
      size: 96,
    },
    {
      accessorFn: (row) => row.group.row.searchVolume,
      cell: ({ row }) => <NumericCell value={row.original.group.row.searchVolume} />,
      enableSorting: false,
      header: "Volume",
      id: "volume",
      meta: { sortable: false, title: "Volume" },
      minSize: 88,
      size: 88,
    },
    {
      accessorFn: (row) => row.group.row.estimatedTraffic,
      cell: ({ row }) => (
        <NumericCell
          value={
            row.original.group.row.estimatedTraffic === null
              ? null
              : Math.round(row.original.group.row.estimatedTraffic)
          }
        />
      ),
      enableSorting: false,
      header: "Est. traffic",
      id: "estimatedTraffic",
      meta: { sortable: false, title: "Est. traffic" },
      minSize: 116,
      size: 116,
    },
  ];
}
