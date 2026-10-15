import { Card } from "@/components/ui/Card";
import { tableHeaderClassName } from "@/components/ui/table-header-styles";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export function LoadingBar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} />;
}

export function LoadingPanel({
  children,
  className,
}: Readonly<{ children: ReactNode; className?: string }>) {
  return <Card className={cn("min-w-0", className)}>{children}</Card>;
}

/** A loading table has no data, selection, sorting or provider side effects. */
export function LoadingTable({
  columns,
  rowHeight = 54,
}: Readonly<{ columns: readonly number[]; rowHeight?: number }>) {
  const width = columns.reduce((sum, column) => sum + column, 0);
  return (
    <div className="min-w-0 overflow-x-auto" data-loading-table>
      <div style={{ minWidth: width }}>
        <div className={cn(tableHeaderClassName, "flex h-10.5")}>
          {columns.map((column, index) => (
            <div
              className="flex shrink-0 items-center px-3"
              key={`heading-${index}`}
              style={{ width: `${(100 * column) / width}%` }}
            >
              <LoadingBar className="h-2.5 w-12 max-w-full" />
            </div>
          ))}
        </div>
        {Array.from({ length: 6 }, (_, row) => (
          <div
            className="flex border-b border-border"
            key={`row-${row}`}
            style={{ minHeight: rowHeight }}
          >
            {columns.map((column, index) => (
              <div
                className="flex shrink-0 items-center px-3"
                key={`cell-${index}`}
                style={{ width: `${(100 * column) / width}%` }}
              >
                <LoadingBar className={index === 0 ? "h-3.5 w-3.5" : "h-3 w-3/4"} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
