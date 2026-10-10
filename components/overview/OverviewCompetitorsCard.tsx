"use client";

import { CompetitorDomainLink } from "@/components/competitors/CompetitorDomainLink";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import { InfoTooltip } from "@/components/ui/InfoTooltip";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type {
  OverviewCompetitorComparison,
  OverviewCompetitorRow,
} from "@/lib/competitors/overview-comparison";
import { appPath } from "@/lib/routing/app-path";
import { useTranslations } from "next-intl";

function columns(
  t: ReturnType<typeof useTranslations<"projectDashboard.competitors">>,
): readonly DataTableColumn<OverviewCompetitorRow>[] {
  return [
    {
      id: "domain",
      header: t("competitor"),
      size: 250,
      minSize: 180,
      meta: { flex: 1.5, sortable: false },
      cell: ({ row: { original: row } }) => (
        <CompetitorDomainLink domain={row.domain} label={row.label} variant="rank-tracker" />
      ),
    },
    {
      id: "found",
      header: () => (
        <span className="flex items-center gap-1">
          {t("found")} <InfoTooltip text={t("foundDescription")} />
        </span>
      ),
      size: 130,
      minSize: 110,
      meta: { sortable: false },
      cell: ({ row }) => t("counts", { left: row.original.found, right: row.original.checked }),
    },
    {
      id: "above",
      header: () => (
        <span className="flex items-center gap-1">
          {t("aboveYou")} <InfoTooltip text={t("aboveYouDescription")} />
        </span>
      ),
      size: 150,
      minSize: 130,
      meta: { sortable: false },
      cell: ({ row }) =>
        row.original.paired
          ? t("counts", { left: row.original.above, right: row.original.paired })
          : "-",
    },
    {
      id: "average",
      header: t("averagePosition"),
      size: 150,
      minSize: 130,
      meta: { sortable: false },
      cell: ({ row }) =>
        row.original.averagePosition === null
          ? "-"
          : t("position", { value: row.original.averagePosition }),
    },
  ];
}

export function OverviewCompetitorsCard({
  data,
  projectRef,
}: Readonly<{ data: OverviewCompetitorComparison; projectRef: string }>) {
  const t = useTranslations("projectDashboard.competitors");
  return (
    <Card
      component="section"
      aria-label={t("summaryAriaLabel")}
      className="min-w-0 overflow-hidden p-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 px-5 py-4">
        <div className="min-w-0">
          <SectionTitle>{t("title")}</SectionTitle>
          <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("description")}</p>
        </div>
        <Button href={appPath(projectRef, "settings/competitors")} size="sm" variant="ghost">
          {t("manage")}
        </Button>
      </div>
      <DataTable
        ariaLabel={t("summaryAriaLabel")}
        bordered={false}
        columns={columns(t)}
        density="compact"
        id="overview-competitors"
        layout="auto"
        onSortingChange={() => undefined}
        rows={data.rows}
        sorting={null}
      />
      <p className="m-0 border-t border-border px-5 py-3 text-[12px] text-fg-muted">
        {data.rows.every((row) => row.checked === 0)
          ? t("footerWithNoSavedSerps", { limited: data.limited ? "true" : "false" })
          : t("footer", { limited: data.limited ? "true" : "false" })}
      </p>
    </Card>
  );
}
