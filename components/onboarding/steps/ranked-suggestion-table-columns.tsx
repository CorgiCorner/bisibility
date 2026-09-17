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
  messages: {
    estimatedTraffic: string;
    keyword: string;
    position: string;
    select: (values: { keyword: string }) => string;
    selectKeyword: string;
    variants: (values: { count: number }) => string;
    volume: string;
  };
  trackedLabel: string;
  onToggle: (key: string) => void;
  selected: ReadonlySet<string>;
};

function KeywordCell({
  messages,
  row,
  trackedLabel,
}: Readonly<{
  messages: ColumnsOptions["messages"];
  row: RankedSuggestionTableRow;
  trackedLabel: string;
}>) {
  const { group, tracked } = row;
  return (
    <span className="min-w-0 truncate font-medium text-fg">
      {group.row.keyword}
      {group.count > 1 ? (
        <span className="ml-2 text-fg-muted">{messages.variants({ count: group.count - 1 })}</span>
      ) : null}
      {tracked ? <span className="ml-2 text-fg-muted">{trackedLabel}</span> : null}
    </span>
  );
}

function NumericCell({ value }: Readonly<{ value: number | null }>) {
  return <span>{value ?? "-"}</span>;
}

export function rankedSuggestionTableColumns({
  messages,
  trackedLabel,
  onToggle,
  selected,
}: Readonly<ColumnsOptions>): readonly DataTableColumn<RankedSuggestionTableRow>[] {
  return [
    {
      cell: ({ row }) => (
        <Checkbox
          aria-label={messages.select({ keyword: row.original.keyword })}
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
      meta: { lockResize: true, lockVisible: true, title: messages.selectKeyword },
      minSize: 44,
      size: 44,
    },
    {
      accessorKey: "keyword",
      cell: ({ row }) => (
        <KeywordCell messages={messages} row={row.original} trackedLabel={trackedLabel} />
      ),
      enableSorting: false,
      header: messages.keyword,
      id: "keyword",
      meta: { flex: 1, lockVisible: true, sortable: false, title: messages.keyword },
      minSize: 160,
      size: 220,
    },
    {
      accessorFn: (row) => row.group.row.position,
      cell: ({ row }) => <NumericCell value={row.original.group.row.position} />,
      enableSorting: false,
      header: messages.position,
      id: "position",
      meta: { sortable: false, title: messages.position },
      minSize: 96,
      size: 96,
    },
    {
      accessorFn: (row) => row.group.row.searchVolume,
      cell: ({ row }) => <NumericCell value={row.original.group.row.searchVolume} />,
      enableSorting: false,
      header: messages.volume,
      id: "volume",
      meta: { sortable: false, title: messages.volume },
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
      header: messages.estimatedTraffic,
      id: "estimatedTraffic",
      meta: { sortable: false, title: messages.estimatedTraffic },
      minSize: 116,
      size: 116,
    },
  ];
}
