import { PaymentChargeLine } from "@/components/action-payment/PaymentChargeLine";
import type { StoredResultFreshness } from "@/components/demo-research/StoredResultFreshness";
import type { BacklinksSnapshot } from "@/lib/backlinks/types";
import { useTranslations } from "next-intl";
import type { ReactNode } from "react";
import { BacklinksSnapshotMeta } from "./BacklinksSnapshotMeta";
import { BacklinksTable, type BacklinksTableProps } from "./BacklinksTable";
import { SummaryCards } from "./SummaryCards";

type BacklinksResultsProps = {
  estimateCents: number | null;
  refreshPrice?: ReactNode;
  loadMorePrice?: ReactNode;
  onLoadMore?: BacklinksTableProps["onLoadMore"];
  onRefresh?: () => void;
  readOnly?: boolean;
  refreshing?: boolean;
  snapshot: Omit<BacklinksSnapshot, "cachedUntil"> & { cachedUntil?: string };
  storedFreshness?: StoredResultFreshness;
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
  const t = useTranslations("projectBacklinks.workspace.snapshot");

  return (
    <section aria-label={t("resultsAria")} className="grid min-w-0 gap-4">
      <BacklinksSnapshotMeta {...props} />
      {props.readOnly ? (
        <PaymentChargeLine
          original
          payment={props.snapshot.originalPayment ?? props.snapshot.payment}
        />
      ) : (
        <PaymentChargeLine payment={props.snapshot.payment} />
      )}
      {!props.readOnly &&
      props.snapshot.originalPayment &&
      props.snapshot.originalPayment.actionId !== props.snapshot.payment?.actionId ? (
        <PaymentChargeLine original payment={props.snapshot.originalPayment} />
      ) : null}
      {props.readOnly && props.snapshot.appendPayment ? (
        <PaymentChargeLine payment={props.snapshot.appendPayment} />
      ) : null}
      {props.snapshot.historyUnavailable ? (
        <p role="status" className="text-sm text-fg-muted">
          {t("historyUnavailable")}
        </p>
      ) : null}
      <SummaryCards
        history={props.snapshot.history}
        historyUnavailable={props.snapshot.historyUnavailable}
        summary={props.snapshot.summary}
      />
      <BacklinksTable
        fetchedRowCount={props.snapshot.fetchedRowCount}
        key={props.snapshot.fetchedAt}
        loadMorePrice={props.loadMorePrice}
        onLoadMore={props.readOnly ? undefined : props.onLoadMore}
        rows={props.snapshot.rows}
        target={props.snapshot.target}
        totalDomains={props.snapshot.summary.referringDomainsTotal}
        totalRowsAvailable={props.snapshot.totalRowsAvailable}
        {...props.tableProps}
      />
    </section>
  );
}
