"use client";

import { PricingPopover, type PricingRow } from "@/components/ui/PricingPopover";
import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { backlinksRates, estimatedFeatureCostCents } from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import type { BacklinksLimit } from "./backlinks-workspace-model";

// TODO(1105): thread the real provider id once AnalyzeCard takes a connection.
const rates = backlinksRates("dataforseo");

type AnalyzePricingPopoverProps = {
  anchor: HTMLElement | null;
  onClose: () => void;
  resultLimit: BacklinksLimit;
  scope: BacklinkTargetScope;
};

function estimateLabel(cents: number | null): string {
  return cents == null ? "price unavailable" : formatEstimateCents(cents);
}

export function AnalyzePricingPopover({
  anchor,
  onClose,
  resultLimit,
  scope,
}: Readonly<AnalyzePricingPopoverProps>) {
  const summaryCents = estimatedFeatureCostCents(
    rates.summary,
    1,
    false,
    LIST_PROVIDER_RATE_CONTEXT,
  );
  const historyCents = estimatedFeatureCostCents(
    rates.history,
    1,
    false,
    LIST_PROVIDER_RATE_CONTEXT,
  );
  const rowsCents = estimatedFeatureCostCents(
    rates.rows,
    resultLimit,
    false,
    LIST_PROVIDER_RATE_CONTEXT,
  );
  const moreRowsCents = estimatedFeatureCostCents(
    rates.rows,
    100,
    false,
    LIST_PROVIDER_RATE_CONTEXT,
  );

  const rows: PricingRow[] = [
    { label: "Profile summary, new and lost", value: estimateLabel(summaryCents) },
  ];
  if (scope === "site") {
    rows.push({ label: "12-month history", value: estimateLabel(historyCents) });
  }
  rows.push({ label: `Link rows (${resultLimit})`, value: estimateLabel(rowsCents) });
  rows.push({
    label: "Loading more rows later",
    value:
      moreRowsCents == null ? "price unavailable" : `${formatEstimateCents(moreRowsCents)} / 100`,
  });

  return (
    <PricingPopover
      anchor={anchor}
      footer={
        <>
          Charged by DataForSEO to your own account. A snapshot stays cached for 24 hours -
          reopening or switching tabs within it is free.
        </>
      }
      onClose={onClose}
      rows={rows}
    />
  );
}
