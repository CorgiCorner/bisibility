import { MenuSelect, type MenuSelectOption } from "@/components/ui";
import type {
  KeywordImportColumnMapping,
  KeywordImportField,
  KeywordImportSourceColumn,
} from "@/lib/keywords/import-csv-parser";
import { ArrowRightIcon as ArrowRight, TableIcon as Table } from "@phosphor-icons/react";

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

function destinationForColumn(mapping: KeywordImportColumnMapping, columnIndex: number) {
  return (
    (Object.entries(mapping).find(([, index]) => index === columnIndex)?.[0] as
      | KeywordImportField
      | undefined) ?? "ignore"
  );
}

export function ImportColumnMapping({
  mapping,
  onChange,
  sourceColumns,
}: Readonly<{
  mapping: KeywordImportColumnMapping;
  onChange: (sourceIndex: number, destination: KeywordImportField | null) => void;
  sourceColumns: readonly KeywordImportSourceColumn[];
}>) {
  return (
    <div className="mt-4 overflow-hidden rounded-card border border-border">
      <div className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 bg-bg-sunken px-[15px] py-2 font-sans tabular-nums text-[10px] uppercase tracking-[0.5px] text-fg-muted">
        <span>In your file</span>
        <span />
        <span>Save as</span>
      </div>
      {sourceColumns.map((source) => (
        <div
          className="grid grid-cols-[minmax(0,1fr)_20px_minmax(0,1fr)] items-center gap-2 border-t border-border px-[15px] py-[11px]"
          key={source.index}
        >
          <span className="inline-flex min-w-0 items-center gap-[7px] font-sans tabular-nums text-[12.5px]">
            <Table weight="regular" className="shrink-0 text-fg-muted" size={14} />
            <span className="truncate">{source.label}</span>
          </span>
          <ArrowRight aria-hidden className="text-fg-muted" size={13} weight="regular" />
          <MenuSelect
            ariaLabel={`Map ${source.label}`}
            onChange={(value) =>
              onChange(source.index, value === "ignore" ? null : (value as KeywordImportField))
            }
            options={destinationOptions}
            triggerClassName="w-full min-w-0"
            value={destinationForColumn(mapping, source.index)}
          />
        </div>
      ))}
    </div>
  );
}
