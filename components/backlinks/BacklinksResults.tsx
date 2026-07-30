import type { BacklinksOutcome, BacklinksSnapshot } from "@/lib/backlinks/types";
import { backlinksRates, estimatedFeatureCostCents } from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import { BacklinksSnapshotMeta } from "./BacklinksSnapshotMeta";
import { BacklinksTable, type BacklinksTableProps } from "./BacklinksTable";
import { SummaryCards } from "./SummaryCards";

type BacklinksResultsProps = {
  estimateCents: number | null;
  onLoadMore?: () => Promise<BacklinksOutcome>;
  onRefresh: () => void;
  refreshing: boolean;
  snapshot: BacklinksSnapshot;
  tableProps?: Partial<
    Pick<
      BacklinksTableProps,
      | "initialAdvancedFilters"
      | "initialDrawerOpen"
      | "initialExpandedDomains"
      | "initialFilter"
      | "initialSlice"
      | "initialView"
      | "now"
    >
  >;
};

export function BacklinksResults(props: Readonly<BacklinksResultsProps>) {
  const rowsEstimateCents = estimatedFeatureCostCents(
    backlinksRates(props.snapshot.provider).rows,
    100,
    false,
    LIST_PROVIDER_RATE_CONTEXT,
  );

  return (
    <section aria-label="Backlinks results" className="grid min-w-0 gap-4">
      <BacklinksSnapshotMeta {...props} />
      <SummaryCards history={props.snapshot.history} summary={props.snapshot.summary} />
      <BacklinksTable
        fetchedRowCount={props.snapshot.fetchedRowCount}
        key={props.snapshot.fetchedAt}
        loadMoreEstimateCents={rowsEstimateCents ?? undefined}
        onLoadMore={props.onLoadMore}
        rows={props.snapshot.rows}
        target={props.snapshot.target}
        totalDomains={props.snapshot.summary.referringDomainsTotal}
        totalRowsAvailable={props.snapshot.totalRowsAvailable}
        {...props.tableProps}
      />
    </section>
  );
}
