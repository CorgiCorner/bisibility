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
import { useTranslations } from "next-intl";

function columns(
  t: ReturnType<typeof useTranslations<"projectRankTracker.keywordDetail.results">>,
): readonly DataTableColumn<SerpComparisonRow>[] {
  return [
    {
      id: "domain",
      header: t("site"),
      size: 240,
      minSize: 180,
      meta: { flex: 1.5, sortable: false },
      cell: ({ row: { original: row } }) => (
        <CompetitorDomainLink domain={row.domain} label={row.own ? t("yourSite") : row.label} />
      ),
    },
    {
      id: "position",
      header: t("positionColumn"),
      size: 170,
      minSize: 160,
      meta: { sortable: false },
      cell: ({ row: { original: row } }) => (
        <span
          className={
            row.position === null ? "text-[11px] text-fg-muted" : "font-semibold tabular-nums"
          }
        >
          {row.position === null ? t("notInSaved") : t("position", { position: row.position })}
        </span>
      ),
    },
    {
      id: "gap",
      header: t("comparedWithYou"),
      size: 160,
      minSize: 150,
      meta: { sortable: false },
      cell: ({ row: { original: row } }) => (
        <span className={row.gap !== null && row.gap < 0 ? "text-red-text" : "text-fg-muted"}>
          {row.gap === null
            ? "-"
            : row.gap === 0
              ? t("samePosition")
              : t(row.gap < 0 ? "aboveYou" : "belowYou", { count: Math.abs(row.gap) })}
        </span>
      ),
    },
  ];
}

export function SerpCompetitorComparison({
  results,
  competitors,
  ownDomain,
}: Readonly<{
  results: RetrievedResults;
  competitors: readonly TrackedCompetitor[];
  ownDomain: string;
}>) {
  const t = useTranslations("projectRankTracker.keywordDetail.results");
  if (competitors.length === 0 || results.tier === "none") return null;
  return (
    <section aria-label={t("competitorComparison")} className="border-b border-border">
      <div className="px-4 py-3 sm:px-5">
        <h3 className="m-0 text-[13px] font-semibold">{t("competitorsInCheck")}</h3>
        <p className="m-0 mt-1 text-[12px] text-fg-muted">{t("competitorDescription")}</p>
      </div>
      <DataTable
        ariaLabel={t("competitorPositions")}
        bordered={false}
        columns={columns(t)}
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
