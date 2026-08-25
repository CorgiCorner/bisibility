"use client";

import { PricingPopover } from "@/components/ui";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { domainOverviewListEstimate } from "@/lib/cost-estimate/provider-rates";
import type { DomainOverviewEstimateView } from "./domain-overview-workspace-model";

type DomainOverviewPricingPopoverProps = {
  anchor: HTMLElement | null;
  estimate: DomainOverviewEstimateView;
  onClose: () => void;
};

const listEstimate = domainOverviewListEstimate("dataforseo");

function estimateLabel(costCents: number | null, fallbackCents: number | null) {
  if (costCents === 0) return "free from cache";
  const amount = costCents ?? fallbackCents;
  return amount == null ? "price unavailable" : `~${formatEstimateCents(amount)}`;
}

export function DomainOverviewPricingPopover({
  anchor,
  estimate,
  onClose,
}: Readonly<DomainOverviewPricingPopoverProps>) {
  return (
    <PricingPopover
      anchor={anchor}
      footer={
        <span>
          Estimated charges go directly to your DataForSEO account. Cached results are free for 12
          hours.
        </span>
      }
      onClose={onClose}
      rows={[
        {
          label: "Overview, keywords and pages",
          value: estimateLabel(estimate.costCents, listEstimate.core),
        },
        {
          label: "Monthly organic history",
          value: estimateLabel(estimate.historyCostCents, listEstimate.history),
        },
        { label: "Repeat within 12 hours", value: "free from cache" },
      ]}
    />
  );
}
