"use client";

import { DashboardEmptyBody } from "@/components/dashboard-layout/DashboardEmptyBody";
import { LocalizedMeasurementHelp } from "@/components/measurement-help/LocalizedMeasurementHelp";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import { dataTableViewportHeight } from "@/components/ui/data-table/data-table-density";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type { OverviewContributor } from "@/lib/queries/overview-contributors";
import type { MeasurementReport } from "@/lib/rank-measurements/types";
import { appPath } from "@/lib/routing/app-path";
import Link from "next/link";
import { useFormatter, useTranslations } from "next-intl";
import { useState } from "react";

const contributorReasonKeys = [
  "current_scope_unavailable",
  "stale",
  "unproven_absence",
  "not_completed",
  "unsupported",
  "missing_scope",
  "scope_mismatch",
  "missing_normalization",
  "invalid_position",
  "insufficient_depth",
  "future_observation",
  "missing_observation_time",
  "not_observed",
] as const;

function isContributorReason(value: string): value is (typeof contributorReasonKeys)[number] {
  return contributorReasonKeys.some((key) => key === value);
}

export function OverviewContributorsCard({
  rows,
  report,
  projectRef,
}: {
  rows: readonly OverviewContributor[];
  report: MeasurementReport;
  projectRef: string;
}) {
  const t = useTranslations("projectDashboard.reportWidgets");
  const format = useFormatter();
  const [pagination, setPagination] = useState({ page: 1, pageSize: 25 });
  const number = (value: number | null) =>
    value === null ? t("unknown") : format.number(value, { maximumFractionDigits: 2 });
  const columns: DataTableColumn<OverviewContributor>[] = [
    {
      id: "keyword",
      header: t("keyword"),
      accessorKey: "keyword",
      cell: ({ row }) => (
        <Link href={appPath(projectRef, "rank-tracker", row.original.id)}>
          {row.original.keyword}
        </Link>
      ),
      meta: { lockVisible: true, sortable: false, flex: 1 },
    },
    { id: "market", header: t("market"), accessorKey: "market", meta: { sortable: false } },
    { id: "device", header: t("device"), accessorKey: "device", meta: { sortable: false } },
    {
      id: "value",
      header: t("contribution"),
      cell: ({ row }) => number(row.original.value),
      meta: { align: "end", sortable: false },
    },
    {
      id: "delta",
      header: t("pairedChange"),
      cell: ({ row }) => number(row.original.delta),
      meta: { align: "end", sortable: false },
    },
    {
      id: "status",
      header: t("status"),
      cell: ({ row }) => {
        const reason = row.original.reason;
        const key = reason !== null && isContributorReason(reason) ? reason : "unknown";
        return (
          <span>
            <span className="block">{t(row.original.status)}</span>
            {row.original.status === "excluded" ? (
              <span className="block text-xs text-fg-muted">{t(`exclusionReasons.${key}`)}</span>
            ) : null}
          </span>
        );
      },
      meta: { sortable: false },
    },
  ];
  return (
    <Card
      component="section"
      aria-label={t("contributors")}
      className="flex h-full min-h-[24.625rem] min-w-0 flex-col overflow-hidden p-0"
      size="md"
    >
      <div className="px-5 pb-3.5 pt-4.5">
        <div className="flex items-center justify-between gap-3">
          <SectionTitle>{t("contributors")}</SectionTitle>
          <LocalizedMeasurementHelp
            metricId={report.metricId}
            definitionVersion={report.definitionVersion}
            report={report}
          />
        </div>
        <p className="mb-0 mt-2 text-xs leading-5 text-fg-muted">{t("contributionDescription")}</p>
      </div>
      {rows.length === 0 ? (
        <DashboardEmptyBody title={t("emptyTitle")} description={t("emptyDescription")} />
      ) : (
        <div
          className="min-h-0"
          style={{
            height: dataTableViewportHeight({
              density: "compact",
              maxRows: 5,
              rows: Math.min(rows.length, pagination.pageSize),
            }),
          }}
          data-contributors-table-viewport
        >
          <DataTable
            ariaLabel={t("contributors")}
            bordered={false}
            columns={columns}
            density="compact"
            id="overview-contributors"
            layout="fill"
            rows={rows}
            sorting={null}
            onSortingChange={() => undefined}
            pagination={{ ...pagination, pageSizeOptions: [25, 50, 100], rowCount: rows.length }}
            paginationMode="client"
            onPaginationChange={setPagination}
          />
        </div>
      )}
    </Card>
  );
}
