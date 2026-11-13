"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { Tooltip } from "@/components/ui/Tooltip";
import {
  disconnectedConversionSource,
  type ResolvedConversionSource,
} from "@/lib/conversions/selection";
import type { ProjectPageColumnKind, ProjectPageRow } from "@/lib/pages/types";
import { useTranslations } from "next-intl";

type ColumnCopy = ReturnType<typeof useTranslations<"projectPages">>;
type Formatter = { number: (value: number) => string };
type TableRow = ProjectPageRow & { id: string };

export function PageColumnHeading({
  disconnected: sourceDisconnected,
  hint,
  kind,
  label,
}: Readonly<{
  disconnected: boolean;
  hint?: string;
  kind: ProjectPageColumnKind;
  label: string;
}>) {
  const t = useTranslations("projectPages");
  const content = sourceDisconnected
    ? t("columnNotConnected", { source: t(`sourceKind.${kind}`) })
    : (hint ?? label);
  return (
    <Tooltip content={content} semantics="description">
      <span>{label}</span>
    </Tooltip>
  );
}

export function PageMissingValue({ source }: Readonly<{ source: string }>) {
  const t = useTranslations("projectPages");
  return (
    <Tooltip content={t("missing", { source })} placement="top" semantics="description">
      <span className="text-fg-muted">-</span>
    </Tooltip>
  );
}

export function conversionsColumn({
  conversion = disconnectedConversionSource,
  format,
  t,
}: Readonly<{
  conversion?: ResolvedConversionSource;
  format: Formatter;
  t: ColumnCopy;
}>): DataTableColumn<TableRow> {
  const source = conversion.options.find((option) => option.source === conversion.selected);
  const connected = !conversion.connect && source != null;
  const label = t("columns.conversions");
  const hint = connected
    ? t("columns.conversionsSource", { source: source.label })
    : t("columns.conversionsConnect");
  return {
    cell: ({ row }) => {
      const value = row.original.conversions;
      if (!connected) return <ConversionDash label={t("columns.conversionsConnect")} />;
      if (value == null) return <ConversionDash label={t("columns.conversionsEmpty")} />;
      return format.number(value);
    },
    header: () => (
      <Tooltip content={hint} semantics="description">
        <span>{label}</span>
      </Tooltip>
    ),
    id: "conversions",
    meta: { align: "end", sortField: "conversions", sortable: true, title: label },
    minSize: 88,
    size: 96,
  };
}

function ConversionDash({ label }: Readonly<{ label: string }>) {
  return (
    <Tooltip content={label} placement="top" semantics="description">
      <span className="text-fg-muted">-</span>
    </Tooltip>
  );
}
