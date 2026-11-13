"use client";

import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { StatusChip, type StatusChipTone } from "@/components/ui/StatusChip";
import { Tooltip } from "@/components/ui/Tooltip";
import type { ProjectPageRow } from "@/lib/pages/types";
import type { PageVitalsStatus } from "@/lib/pagespeed/view";
import { useFormatter, useTranslations } from "next-intl";
import type { ProjectPagesTableRow } from "./project-pages-columns";

const TONE = {
  good: "positive",
  needs_improvement: "attention",
  poor: "critical",
  unknown: "neutral",
} as const satisfies Record<PageVitalsStatus, StatusChipTone>;

const LABEL = {
  good: "pass",
  needs_improvement: "needsWork",
  poor: "poor",
  unknown: "none",
} as const satisfies Record<PageVitalsStatus, "needsWork" | "none" | "pass" | "poor">;

function metricText(
  format: ReturnType<typeof useFormatter>,
  t: ReturnType<typeof useTranslations<"projectPages">>,
  vitals: NonNullable<ProjectPageRow["vitals"]>,
) {
  const lcp =
    vitals.lcpMs == null
      ? t("cwv.none")
      : t("cwv.seconds", {
          value: format.number(vitals.lcpMs / 1000, {
            maximumFractionDigits: 1,
            minimumFractionDigits: 1,
          }),
        });
  const inp =
    vitals.inpMs == null
      ? t("cwv.none")
      : t("cwv.milliseconds", { value: format.number(vitals.inpMs) });
  const cls =
    vitals.cls == null
      ? t("cwv.none")
      : format.number(vitals.cls, { maximumFractionDigits: 2, minimumFractionDigits: 2 });
  return t("cwv.tooltip", { cls, inp, lcp, source: t(`cwv.source.${vitals.source}`) });
}

function CwvCell({ disconnected, row }: Readonly<{ disconnected: boolean; row: ProjectPageRow }>) {
  const t = useTranslations("projectPages");
  const format = useFormatter();
  if (disconnected) {
    return (
      <Tooltip
        content={t("missing", { source: t("sourceKind.pagespeed") })}
        semantics="description"
      >
        <span className="text-fg-muted">-</span>
      </Tooltip>
    );
  }
  const vitals = row.vitals;
  if (!vitals || vitals.status === "unknown") return <span className="text-fg-muted">-</span>;
  return (
    <Tooltip content={metricText(format, t, vitals)} semantics="description">
      <StatusChip label={t(`cwv.${LABEL[vitals.status]}`)} size="sm" tone={TONE[vitals.status]} />
    </Tooltip>
  );
}

export function projectPageCwvColumn({
  disconnected,
  t,
}: Readonly<{
  disconnected: boolean;
  t: ReturnType<typeof useTranslations<"projectPages">>;
}>): DataTableColumn<ProjectPagesTableRow> {
  const label = t("columns.cwv");
  return {
    cell: ({ row }) => <CwvCell disconnected={disconnected} row={row.original} />,
    header: () =>
      disconnected ? (
        <Tooltip
          content={t("columnNotConnected", { source: t("sourceKind.pagespeed") })}
          semantics="description"
        >
          <span>{label}</span>
        </Tooltip>
      ) : (
        <span>{label}</span>
      ),
    id: "cwv",
    meta: { sortable: false, title: label },
    minSize: 120,
    size: 132,
  };
}
