"use client";

import { TableHead } from "@/components/usagekit/primitives/table";
import { cn } from "@/lib/ui/cn";
import { CaretDownIcon } from "@phosphor-icons/react/dist/csr/CaretDown";
import { CaretUpIcon } from "@phosphor-icons/react/dist/csr/CaretUp";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { nextDataTableSort } from "./data-table/data-table-sorting";
import type { DataTableSort } from "./data-table/data-table-types";

type SortProps = {
  field: string;
  label: string;
  sorting: DataTableSort | null;
  onSortingChange: (next: DataTableSort | null) => void;
  descendingFirst?: boolean;
  align?: "start" | "end";
};

export function TableSortButton({
  field,
  label,
  sorting,
  onSortingChange,
  descendingFirst = false,
  align = "start",
  children,
  labelId,
}: SortProps & { children?: ReactNode; labelId?: string }) {
  const t = useTranslations("shared.controls.dataTable");
  const active = sorting?.field === field ? sorting.direction : undefined;
  const next = nextDataTableSort(sorting, field, descendingFirst);
  const action = next
    ? t(next.direction === "asc" ? "sortAscending" : "sortDescending", { column: label })
    : t("clearSort", { column: label });
  return (
    <button
      type="button"
      aria-label={action}
      className={cn(
        "flex min-w-0 flex-1 items-center gap-1.5 overflow-hidden p-0 [font:inherit] [letter-spacing:inherit] [text-transform:inherit] hover:text-fg",
        align === "end" ? "justify-end" : "justify-start",
        active ? "text-accent-text" : "text-fg-muted",
      )}
      onClick={() => onSortingChange(next)}
    >
      <span className="truncate" id={labelId}>
        {children ?? label}
      </span>
      {active === "asc" ? (
        <CaretUpIcon aria-hidden size={9} weight="regular" />
      ) : active === "desc" ? (
        <CaretDownIcon aria-hidden size={9} weight="regular" />
      ) : (
        <span aria-hidden className="grid leading-none">
          <CaretUpIcon className="row-start-1" size={7} weight="regular" />
          <CaretDownIcon className="row-start-2" size={7} weight="regular" />
        </span>
      )}
    </button>
  );
}

export function SortableTableHead({
  className,
  children,
  ...props
}: SortProps & { className?: string; children?: ReactNode }) {
  const active = props.sorting?.field === props.field ? props.sorting.direction : undefined;
  return (
    <TableHead
      className={className}
      aria-sort={active ? (active === "asc" ? "ascending" : "descending") : "none"}
    >
      <div className="flex items-center gap-1.5">
        <TableSortButton {...props} />
        {children}
      </div>
    </TableHead>
  );
}
