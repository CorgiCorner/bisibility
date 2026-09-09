import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { TableIcon as Table } from "@phosphor-icons/react/dist/csr/Table";

export type KeywordImportPreviewRow = {
  city?: string | null;
  device?: string | null;
  intent?: string | null;
  keyword: string;
  marketName?: string;
  marketStatus?: "active" | "paused";
  language?: string | null;
  location?: string | null;
  locationKey?: string | null;
  row: number;
  tags?: readonly string[] | null;
  targetUrl?: string | null;
  topic?: string | null;
};

export type ImportPreviewDataTableRow = KeywordImportPreviewRow & { id: string };
export type ImportColumnMappingDataTableRow = KeywordImportSourceColumn & { id: string };

const destinationOptions: MenuSelectOption[] = [
  { label: "Ignore this column", value: "ignore" },
  { label: "Keyword", value: "keyword" },
  { label: "Target URL", value: "targetUrl" },
  { label: "Tags", value: "tags" },
  { label: "Topic", value: "topic" },
  { label: "Intent", value: "intent" },
  { label: "Country", value: "location" },
  { label: "Search language", value: "language" },
  { label: "City", value: "city" },
  { label: "Location key", value: "locationKey" },
  { label: "Device", value: "device" },
];

type PreviewTextField = Exclude<keyof KeywordImportPreviewRow, "row" | "tags">;

function previewCell(value: string | null | undefined) {
  return value || "-";
}

function previewTextColumn(
  id: PreviewTextField,
  header: string,
  size: number,
  flex = 1,
): DataTableColumn<ImportPreviewDataTableRow> {
  return {
    accessorKey: id,
    cell: ({ getValue }) => (
      <span className="block truncate">{previewCell(getValue() as string)}</span>
    ),
    enableResizing: false,
    enableSorting: false,
    header,
    id,
    meta: { flex, lockResize: true, lockVisible: true, sortable: false, title: header },
    minSize: size,
    size,
  };
}

export const importPreviewTableColumns: readonly DataTableColumn<ImportPreviewDataTableRow>[] = [
  {
    ...previewTextColumn("keyword", "Keyword", 128, 2),
    cell: ({ getValue }) => (
      <span className="block truncate font-semibold text-fg">
        {previewCell(getValue() as string)}
      </span>
    ),
  },
  {
    ...previewTextColumn("marketName", "Market", 220, 2),
    cell: ({ row }) => (
      <span className="block truncate" title={row.original.marketName}>
        {row.original.marketName ?? "-"}
        {row.original.marketStatus === "paused" ? " (paused)" : ""}
      </span>
    ),
  },
  previewTextColumn("targetUrl", "Target URL", 160, 2),
  {
    accessorKey: "tags",
    cell: ({ getValue }) => (
      <span className="block truncate">
        {(getValue() as readonly string[] | null)?.join(", ") || "-"}
      </span>
    ),
    enableResizing: false,
    enableSorting: false,
    header: "Tags",
    id: "tags",
    meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: "Tags" },
    minSize: 96,
    size: 96,
  },
  previewTextColumn("topic", "Topic", 112),
  previewTextColumn("intent", "Intent", 112),
  previewTextColumn("location", "Country", 112),
  previewTextColumn("language", "Language", 128),
  previewTextColumn("city", "City", 96),
  previewTextColumn("locationKey", "Location key", 144),
  previewTextColumn("device", "Device", 112),
];

function destinationForColumn(mapping: KeywordImportColumnMapping, columnIndex: number) {
  return (
    (Object.entries(mapping).find(([, index]) => index === columnIndex)?.[0] as
      | KeywordImportField
      | undefined) ?? "ignore"
  );
}

export function importColumnMappingTableColumns(
  mapping: KeywordImportColumnMapping,
  onChange: (sourceIndex: number, destination: KeywordImportField | null) => void,
): readonly DataTableColumn<ImportColumnMappingDataTableRow>[] {
  return [
    {
      accessorKey: "label",
      cell: ({ row }) => (
        <span className="inline-flex min-w-0 items-center gap-[7px] font-sans tabular-nums text-[12.5px]">
          <Table className="shrink-0 text-fg-muted" size={14} weight="regular" />
          <span className="truncate">{row.original.label}</span>
        </span>
      ),
      enableResizing: false,
      enableSorting: false,
      header: "In your file",
      id: "source",
      meta: {
        flex: 1,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: "In your file",
      },
      minSize: 192,
      size: 192,
    },
    {
      cell: () => <ArrowRight aria-hidden className="text-fg-muted" size={13} weight="regular" />,
      enableResizing: false,
      enableSorting: false,
      header: "",
      id: "direction",
      meta: { lockResize: true, lockVisible: true, sortable: false },
      minSize: 40,
      size: 40,
    },
    {
      cell: ({ row }) => (
        <MenuSelect
          ariaLabel={`Map ${row.original.label}`}
          onChange={(value) =>
            onChange(row.original.index, value === "ignore" ? null : (value as KeywordImportField))
          }
          options={destinationOptions}
          triggerClassName="w-full min-w-0"
          value={destinationForColumn(mapping, row.original.index)}
        />
      ),
      enableResizing: false,
      enableSorting: false,
      header: "Save as",
      id: "destination",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: "Save as" },
      minSize: 192,
      size: 192,
    },
  ];
}
