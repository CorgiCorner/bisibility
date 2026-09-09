"use client";

import { CompetitorDomainLink } from "@/components/competitors/CompetitorDomainLink";
import { DataTable } from "@/components/ui/data-table/DataTable";
import type { DataTableColumn } from "@/components/ui/data-table/data-table-types";
import type { RetrievedResults } from "@/lib/checks/contract";
import {
  buildSerpComparison,
  type SerpComparisonRow,
  type TrackedCompetitor,
} from "@/lib/competitors/serp-comparison";

const columns: readonly DataTableColumn<SerpComparisonRow>[] = [
  {
    id: "domain",
    header: "Site",
    size: 240,
    minSize: 180,
    meta: { flex: 1.5, sortable: false },
    cell: ({ row: { original: row } }) => (
      <CompetitorDomainLink domain={row.domain} label={row.label} />
    ),
  },
  {
    id: "position",
    header: "Position",
    size: 170,
    minSize: 160,
    meta: { sortable: false },
    cell: ({ row: { original: row } }) => (
      <span
        className={
          row.position === null ? "text-[11px] text-fg-muted" : "font-semibold tabular-nums"
        }
      >
        {row.position === null ? "Not in saved results" : `#${row.position}`}
      </span>
    ),
  },
  {
    id: "gap",
    header: "Compared with you",
    size: 160,
    minSize: 150,
    meta: { sortable: false },
    cell: ({ row: { original: row } }) => (
      <span className={row.gap !== null && row.gap < 0 ? "text-red-text" : "text-fg-muted"}>
        {row.gap === null
          ? "-"
          : row.gap === 0
            ? "Same position"
            : `${Math.abs(row.gap)} ${row.gap < 0 ? "above you" : "below you"}`}
      </span>
    ),
  },
];

export function SerpCompetitorComparison({
  results,
  competitors,
  ownDomain,
}: Readonly<{
  results: RetrievedResults;
  competitors: readonly TrackedCompetitor[];
  ownDomain: string;
}>) {
  if (competitors.length === 0 || results.tier === "none") return null;
  return (
    <section aria-label="Competitor comparison" className="border-b border-border">
      <div className="px-4 py-3 sm:px-5">
        <h3 className="m-0 text-[13px] font-semibold">Competitors in this check</h3>
        <p className="m-0 mt-1 text-[12px] text-fg-muted">
          Positions from the same saved search results. Missing domains may be outside the retrieved
          portion.
        </p>
      </div>
      <DataTable
        ariaLabel="Competitor positions"
        bordered={false}
        columns={columns}
        density="compact"
        id="serp-competitors"
        layout="auto"
        onSortingChange={() => undefined}
        rows={buildSerpComparison(results, competitors, ownDomain)}
        sorting={null}
      />
    </section>
  );
}
