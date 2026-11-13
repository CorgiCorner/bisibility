"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableProps } from "@/components/ui/data-table/data-table-types";
import type { KeywordRow } from "@/lib/queries/keywords";
import { useTranslations } from "next-intl";
import { KeywordNoRowsOverlay, type KeywordNoRowsState } from "./KeywordTableStatus";
import { pickGridProps } from "./keywords-grid-projection";

const requiredTableProps = [
  "columnSizing",
  "columns",
  "columnVisibility",
  "density",
  "id",
  "onColumnSizingChange",
  "onColumnVisibilityChange",
  "onPaginationChange",
  "onSelectionChange",
  "onSortingChange",
  "pagination",
  "rows",
  "selection",
  "sorting",
] as const;
const optionalTableProps = ["columnOrder", "footerStart", "pending"] as const;
const tableProps = [...requiredTableProps, ...optionalTableProps];
type TableProps = DataTableProps<KeywordRow>;
type KeywordGridViewportProps = Required<Pick<TableProps, (typeof requiredTableProps)[number]>> &
  Pick<TableProps, (typeof optionalTableProps)[number] | "paginationMode" | "sortingMode"> & {
    pagination: NonNullable<TableProps["pagination"]>;
    noRowsState?: KeywordNoRowsState;
    onNavigate: (keywordId: string) => void;
  };

export function KeywordGridViewport(props: Readonly<KeywordGridViewportProps>) {
  const t = useTranslations("projectRankTracker.keywordImport.management.grid");
  return (
    <div className="min-w-0 max-w-full">
      <div
        className="h-[650px] min-h-[420px] max-h-[calc(100dvh-200px)] w-full min-w-0 max-w-full overflow-x-auto"
        data-testid="keywords-grid-viewport"
      >
        <DataTable
          {...pickGridProps(props, tableProps)}
          bordered={false}
          className="h-full max-h-full w-full min-w-0 max-w-full"
          ariaLabel={t("tableAria")}
          emptyState={<KeywordNoRowsOverlay state={props.noRowsState} />}
          layout="fill"
          onRowClick={(row) => props.onNavigate(row.id)}
          paginationMode="server"
          rowHeight={(row) => (row.rankEvidence ? 112 : undefined)}
          sortingMode="server"
        />
      </div>
    </div>
  );
}
