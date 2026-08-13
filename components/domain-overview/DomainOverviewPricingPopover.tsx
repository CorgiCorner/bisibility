"use client";

import { formatEstimateCents } from "@/lib/cost-estimate/project-estimate";
import { domainOverviewListEstimate } from "@/lib/cost-estimate/provider-rates";
import Popover from "@mui/material/Popover";
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
  const rows = [
    ["Overview, keywords and pages", estimateLabel(estimate.costCents, listEstimate.core)],
    ["Monthly organic history", estimateLabel(estimate.historyCostCents, listEstimate.history)],
    ["Repeat within 12 hours", "free from cache"],
  ] as const;
  return (
    <Popover
      anchorEl={anchor}
      anchorOrigin={{ horizontal: "right", vertical: "bottom" }}
      onClose={onClose}
      open={Boolean(anchor)}
      slotProps={{
        paper: {
          sx: {
            backgroundColor: "var(--bg-elev)",
            border: "1px solid var(--border-strong)",
            borderRadius: "10px",
            boxShadow: "none",
            marginTop: "10px",
          },
        },
      }}
      transformOrigin={{ horizontal: "right", vertical: "top" }}
    >
      <div className="w-[330px] max-w-[calc(100vw-32px)] p-4 text-fg">
        <p className="mb-2.5 mt-0 font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
          Provider cost
        </p>
        <div className="divide-y divide-border">
          {rows.map(([label, value]) => (
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-4 py-[5px] text-[13px]"
              key={label}
            >
              <span>{label}</span>
              <span className="whitespace-nowrap text-right font-mono text-fg-muted">{value}</span>
            </div>
          ))}
          <p className="mb-0 mt-2.5 pt-2.5 text-[12.5px] leading-[1.55] text-fg-muted">
            Estimated charges go directly to your DataForSEO account. Cached results are free for 12
            hours.
          </p>
        </div>
      </div>
    </Popover>
  );
}
