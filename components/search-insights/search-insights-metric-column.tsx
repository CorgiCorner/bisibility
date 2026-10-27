import type {
  DataTableColumn,
  DataTableRowBase,
} from "@/components/ui/data-table/data-table-types";
import type { useTranslations } from "next-intl";
import {
  formatRowCount,
  formatRowCtr,
  formatRowPosition,
  positionClassName,
} from "./search-insights-rows-model";

type Metric = "clicks" | "impressions" | "ctr" | "position";
type MetricRow = DataTableRowBase & Record<Metric, number>;
type Translate = ReturnType<typeof useTranslations<"projectSearchInsights.copy">>;

const metrics = {
  clicks: { headerKey: "clicks", titleKey: "clicks", size: 80, format: formatRowCount },
  impressions: {
    headerKey: "impressionsShort",
    titleKey: "impressions",
    size: 72,
    format: formatRowCount,
  },
  ctr: { headerKey: "ctr", titleKey: "ctr", size: 64, format: formatRowCtr },
  position: {
    headerKey: "averagePosition",
    titleKey: "avgPositionTip",
    size: 88,
    format: formatRowPosition,
  },
} as const;

/** Query and page tables share metric semantics, not their identity or action columns. */
export function searchInsightsMetricColumn<TRow extends MetricRow>(
  metric: Metric,
  locale: string,
  sortable: boolean,
  t: Translate,
): DataTableColumn<TRow> {
  const definition = metrics[metric];
  return {
    accessorKey: metric,
    cell: ({ row }) => {
      const value = row.original[metric];
      const emphasis =
        metric === "position"
          ? positionClassName(value)
          : metric === "clicks"
            ? "font-semibold"
            : "text-fg-muted";
      return (
        <span className={`font-sans tabular-nums text-ui-caption ${emphasis}`}>
          {definition.format(value, locale)}
        </span>
      );
    },
    header: t(definition.headerKey),
    id: metric,
    meta: { align: "end", sortField: metric, sortable, title: t(definition.titleKey) },
    minSize: definition.size,
    size: definition.size,
    ...(metric === "position" ? {} : { sortDescFirst: true }),
  };
}
