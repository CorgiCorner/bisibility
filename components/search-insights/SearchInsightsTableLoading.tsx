"use client";

import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { FIRST_VIEW_ROWS } from "@/lib/search-insights/constants";
import { useLocale, useTranslations } from "next-intl";
import { SEARCH_INSIGHTS_TABLE_DENSITY } from "./SearchInsightsTableFrame";
import { searchInsightsQueryColumns } from "./search-insights-data-table-columns";

const BAR = "motion-safe:animate-pulse rounded-control bg-bg-sunken";
const EMPTY_SET: ReadonlySet<string> = new Set();
const noop = () => undefined;
type PendingRow = { id: string };

export function SearchInsightsTableLoading({ pages = false }: Readonly<{ pages?: boolean }>) {
  const t = useTranslations("projectSearchInsights.copy");
  const locale = useLocale();
  const title = pages ? t("topPages") : t("topQueries");
  const columns: DataTableColumn<PendingRow>[] = searchInsightsQueryColumns({
    adding: EMPTY_SET,
    tracked: EMPTY_SET,
    locale,
    sortable: false,
    t,
  }).map(({ id, header, meta, minSize, size }) => {
    if (!id) throw new Error("Search columns require stable IDs");
    return {
      id,
      header:
        id === "actions"
          ? () => <span className="sr-only">{t("actions")}</span>
          : id === "text" && pages
            ? t("page")
            : typeof header === "string"
              ? header
              : undefined,
      meta,
      minSize,
      size,
      enableSorting: false,
      enableResizing: false,
      cell: () => <div className={`${BAR} h-3 w-full max-w-48`} />,
    };
  });
  return (
    <section
      aria-hidden
      className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev"
    >
      <div className="flex min-w-0 items-start gap-2 px-4 pb-3 pt-3.5">
        <div className="flex min-w-0 flex-1 flex-col gap-1">
          <h2 className="m-0 min-w-0 text-ui-body-relaxed font-semibold">{title}</h2>
          <div className={`${BAR} h-[1lh] w-64 max-w-full text-ui-caption`} />
        </div>
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2.5 px-4 pb-3">
        <div className={`${BAR} h-[34px] min-w-0 flex-1 sm:max-w-[320px]`} />
      </div>
      <div className="border-t border-border">
        <DataTable
          ariaLabel={title}
          bordered={false}
          columns={columns}
          density={SEARCH_INSIGHTS_TABLE_DENSITY}
          id={`search-insights-${pages ? "pages" : "queries"}-loading`}
          layout="auto"
          onSortingChange={noop}
          rows={Array.from({ length: FIRST_VIEW_ROWS }, (_, index) => ({ id: String(index) }))}
          sorting={null}
        />
      </div>
      <div className="flex h-[52px] items-center justify-between border-t border-border px-4">
        <div className={`${BAR} h-3 w-24`} />
        <div className={`${BAR} h-7 w-40`} />
      </div>
    </section>
  );
}
