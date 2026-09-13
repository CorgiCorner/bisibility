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

const columns: readonly DataTableColumn<OverviewCompetitorRow>[] = [
  {
    id: "domain",
    header: "Competitor",
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
        Found{" "}
        <InfoTooltip text="Targets where this domain appears, out of saved SERPs in its selected markets. Each market and device is a separate target." />
      </span>
    ),
    size: 130,
    minSize: 110,
    meta: { sortable: false },
    cell: ({ row }) => `${row.original.found} / ${row.original.checked}`,
  },
  {
    id: "above",
    header: () => (
      <span className="flex items-center gap-1">
        Above you{" "}
        <InfoTooltip text="Targets where this competitor ranks above you, out of targets where both sites have a known position in the same check." />
      </span>
    ),
    size: 150,
    minSize: 130,
    meta: { sortable: false },
    cell: ({ row }) =>
      row.original.paired ? `${row.original.above} / ${row.original.paired}` : "-",
  },
  {
    id: "average",
    header: "Avg. position",
    size: 150,
    minSize: 130,
    meta: { sortable: false },
    cell: ({ row }) =>
      row.original.averagePosition === null ? "-" : `#${row.original.averagePosition}`,
  },
];

export function OverviewCompetitorsCard({
  data,
  projectRef,
}: Readonly<{ data: OverviewCompetitorComparison; projectRef: string }>) {
  return (
    <Card
      component="section"
      aria-label="Competitor summary"
      className="min-w-0 overflow-hidden p-0"
    >
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-5 py-4">
        <div className="min-w-0">
          <SectionTitle>Competitors in your results</SectionTitle>
          <p className="m-0 mt-1 text-[12px] text-fg-muted">
            Latest completed check per target within the selected period, markets, devices and tags.
          </p>
        </div>
        <Button href={appPath(projectRef, "settings/competitors")} size="sm" variant="ghost">
          Manage competitors
        </Button>
      </div>
      <DataTable
        ariaLabel="Competitor summary"
        bordered={false}
        columns={columns}
        density="compact"
        id="overview-competitors"
        layout="auto"
        onSortingChange={() => undefined}
        rows={data.rows}
        sorting={null}
      />
      <p className="m-0 border-t border-border px-5 py-3 text-[12px] text-fg-muted">
        {data.rows.every((row) => row.checked === 0)
          ? "No saved SERPs for these competitors in the selected period. "
          : null}
        Missing domains are not treated as losses. Average position uses found results only.
        {data.limited ? " Showing the 2,000 most recently added targets." : null}
      </p>
    </Card>
  );
}
