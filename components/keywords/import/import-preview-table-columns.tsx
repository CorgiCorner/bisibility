import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { MenuSelect, type MenuSelectOption } from "@/components/ui/MenuSelect";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/csr/ArrowRight";
import { TableIcon as Table } from "@phosphor-icons/react/dist/csr/Table";
import type { useTranslations } from "next-intl";

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

type TableTranslator = ReturnType<
  typeof useTranslations<"projectRankTracker.keywordImport.csvWizard.table">
>;

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

export function importPreviewTableColumns(
  t: TableTranslator,
): readonly DataTableColumn<ImportPreviewDataTableRow>[] {
  return [
    {
      ...previewTextColumn("keyword", t("keyword"), 128, 2),
      cell: ({ getValue }) => (
        <span className="block truncate font-semibold text-fg">
          {previewCell(getValue() as string)}
        </span>
      ),
    },
    {
      ...previewTextColumn("marketName", t("market"), 220, 2),
      cell: ({ row }) => (
        <span className="block truncate" title={row.original.marketName}>
          {row.original.marketName ?? "-"}
          {row.original.marketStatus === "paused" ? ` ${t("paused")}` : ""}
        </span>
      ),
    },
    previewTextColumn("targetUrl", t("targetUrl"), 160, 2),
    {
      accessorKey: "tags",
      cell: ({ getValue }) => (
        <span className="block truncate">
          {(getValue() as readonly string[] | null)?.join(", ") || "-"}
        </span>
      ),
      enableResizing: false,
      enableSorting: false,
      header: t("tags"),
      id: "tags",
      meta: { flex: 1, lockResize: true, lockVisible: true, sortable: false, title: t("tags") },
      minSize: 96,
      size: 96,
    },
    previewTextColumn("topic", t("topic"), 112),
    previewTextColumn("intent", t("intent"), 112),
    previewTextColumn("location", t("country"), 112),
    previewTextColumn("language", t("language"), 128),
    previewTextColumn("city", t("city"), 96),
    previewTextColumn("locationKey", t("locationKey"), 144),
    previewTextColumn("device", t("device"), 112),
  ];
}

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
  t: TableTranslator,
): readonly DataTableColumn<ImportColumnMappingDataTableRow>[] {
  const destinationOptions: MenuSelectOption[] = [
    { label: t("ignore"), value: "ignore" },
    { label: t("keyword"), value: "keyword" },
    { label: t("targetUrl"), value: "targetUrl" },
    { label: t("tags"), value: "tags" },
    { label: t("topic"), value: "topic" },
    { label: t("intent"), value: "intent" },
    { label: t("country"), value: "location" },
    { label: t("language"), value: "language" },
    { label: t("city"), value: "city" },
    { label: t("locationKey"), value: "locationKey" },
    { label: t("device"), value: "device" },
  ];
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
      header: t("source"),
      id: "source",
      meta: {
        flex: 1,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: t("source"),
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
          ariaLabel={t("map", { column: row.original.label })}
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
      header: t("destination"),
      id: "destination",
      meta: {
        flex: 1,
        lockResize: true,
        lockVisible: true,
        sortable: false,
        title: t("destination"),
      },
      minSize: 192,
      size: 192,
    },
  ];
}
