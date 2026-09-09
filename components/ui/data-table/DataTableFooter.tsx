"use client";

import { MenuSelect } from "@/components/ui/MenuSelect";
import { cn } from "@/lib/ui/cn";
import { CaretLeftIcon as CaretLeft } from "@phosphor-icons/react/dist/csr/CaretLeft";
import { CaretRightIcon as CaretRight } from "@phosphor-icons/react/dist/csr/CaretRight";
import type { ReactNode } from "react";
import type { DataTablePagination } from "./data-table-types";

type DataTableFooterProps = {
  footerStart?: ReactNode;
  layout: "auto" | "fill";
  onPaginationChange?: (next: { page: number; pageSize: number }) => void;
  page: number;
  pagination?: DataTablePagination | null;
  rowCount: number;
};

const number = new Intl.NumberFormat("en-US");

export function DataTableFooter({
  footerStart,
  layout,
  onPaginationChange,
  page,
  pagination,
  rowCount,
}: Readonly<DataTableFooterProps>) {
  if (!pagination && !(layout === "fill" && footerStart)) return null;
  const pageSize = pagination?.pageSize ?? 1;
  const pageCount = Math.max(1, Math.ceil(rowCount / pageSize));
  const start = rowCount === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = rowCount === 0 ? 0 : Math.min(rowCount, page * pageSize);
  const pageSizeOptions = pagination
    ? [...new Set([...pagination.pageSizeOptions, pagination.pageSize])]
    : [];
  return (
    <div
      className={cn(
        "sticky left-0 z-10 flex min-h-[52px] w-full min-w-0 shrink-0 flex-wrap items-center justify-between gap-x-5 gap-y-2 border-t border-border bg-bg-elev px-4 py-2.5",
        layout === "fill" && "bottom-0 mt-auto",
      )}
      data-testid="data-table-footer"
    >
      {footerStart !== undefined ? (
        <div className="min-w-0 flex-1 basis-full text-[12px] text-fg-muted sm:basis-auto">
          {footerStart}
        </div>
      ) : null}
      {pagination ? (
        <div className="ml-auto flex min-w-0 max-w-full flex-wrap items-center justify-end gap-x-4 gap-y-2">
          <MenuSelect
            ariaLabel="Rows per page"
            compact
            leadingLabel="Rows"
            onChange={(value) =>
              onPaginationChange?.({ page: 1, pageSize: Number.parseInt(value, 10) })
            }
            options={pageSizeOptions.map((value) => ({
              label: number.format(value),
              value: String(value),
            }))}
            triggerClassName="border-0 bg-transparent px-0 font-sans tabular-nums"
            value={String(pagination.pageSize)}
          />
          <span className="whitespace-nowrap font-sans tabular-nums text-[12px] text-fg-muted">
            {number.format(start)}-{number.format(end)} of {number.format(rowCount)}
          </span>
          <div className="flex gap-1">
            <button
              aria-label="Previous page"
              className="grid size-[30px] place-items-center rounded-full border border-border-control bg-transparent text-fg hover:bg-bg-sunken disabled:cursor-not-allowed disabled:text-fg-muted disabled:hover:bg-transparent"
              disabled={page <= 1 || !onPaginationChange}
              onClick={() => onPaginationChange?.({ page: page - 1, pageSize })}
              type="button"
            >
              <CaretLeft aria-hidden size={12} weight="regular" />
            </button>
            <button
              aria-label="Next page"
              className="grid size-[30px] place-items-center rounded-full border border-border-control bg-transparent text-fg hover:bg-bg-sunken disabled:cursor-not-allowed disabled:text-fg-muted disabled:hover:bg-transparent"
              disabled={page >= pageCount || !onPaginationChange}
              onClick={() => onPaginationChange?.({ page: page + 1, pageSize })}
              type="button"
            >
              <CaretRight aria-hidden size={12} weight="regular" />
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
