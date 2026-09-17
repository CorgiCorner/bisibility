"use client";

import { PricingPopover } from "@/components/ui/PricingPopover";
import { domainOverviewListEstimate } from "@/lib/cost-estimate/provider-rates";
import { useLocale, useTranslations } from "next-intl";
import { formatDomainEstimatedCost } from "./domain-overview-metrics";
import type { DomainOverviewEstimateView } from "./domain-overview-workspace-model";

type DomainOverviewPricingPopoverProps = {
  anchor: HTMLElement | null;
  estimate: DomainOverviewEstimateView;
  onClose: () => void;
};

const listEstimate = domainOverviewListEstimate("dataforseo");

function estimateLabel(
  costCents: number | null,
  fallbackCents: number | null,
  locale: string,
  t: ReturnType<typeof useTranslations<"projectDomainOverview.workspace.ui">>,
) {
  if (costCents === 0) return t("priceFreeFromCache");
  const amount = costCents ?? fallbackCents;
  return amount == null ? t("priceUnavailable") : formatDomainEstimatedCost(amount, locale, t);
}

export function DomainOverviewPricingPopover({
  anchor,
  estimate,
  onClose,
}: Readonly<DomainOverviewPricingPopoverProps>) {
  const locale = useLocale();
  const t = useTranslations("projectDomainOverview.workspace.ui");
  return (
    <PricingPopover
      anchor={anchor}
      footer={<span>{t("pricingFooter")}</span>}
      onClose={onClose}
      rows={[
        {
          label: t("pricingCore"),
          value: estimateLabel(estimate.costCents, listEstimate.core, locale, t),
        },
        {
          label: t("pricingHistory"),
          value: estimateLabel(estimate.historyCostCents, listEstimate.history, locale, t),
        },
        { label: t("pricingRepeat"), value: t("priceFreeFromCache") },
      ]}
    />
  );
}
