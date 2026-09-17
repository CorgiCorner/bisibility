"use client";

import { formatResearchEstimateCents } from "@/components/research/research-money";
import { PricingPopover, type PricingRow } from "@/components/ui/PricingPopover";
import { backlinksRates, estimatedFeatureCostCents } from "@/lib/cost-estimate/provider-rates";
import { LIST_PROVIDER_RATE_CONTEXT } from "@/lib/provider-rates/resolver";
import type { BacklinkTargetScope } from "@/lib/providers/types";
import { useFormatter, useTranslations } from "next-intl";
import type { BacklinksLimit } from "./backlinks-workspace-model";

// TODO(1105): thread the real provider id once AnalyzeCard takes a connection.
const rates = backlinksRates("dataforseo");

type AnalyzePricingPopoverProps = {
  anchor: HTMLElement | null;
  onClose: () => void;
  resultLimit: BacklinksLimit;
  scope: BacklinkTargetScope;
};

function estimateLabel(
  cents: number | null,
  formatNumber: ReturnType<typeof useFormatter>["number"],
  t: ReturnType<typeof useTranslations<"projectBacklinks.workspace.pricing">>,
): string {
  return cents == null ? t("unavailable") : formatResearchEstimateCents(cents, formatNumber);
}

export function AnalyzePricingPopover({
  anchor,
  onClose,
  resultLimit,
  scope,
}: Readonly<AnalyzePricingPopoverProps>) {
  const format = useFormatter();
  const t = useTranslations("projectBacklinks.workspace.pricing");
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
    { label: t("profileSummary"), value: estimateLabel(summaryCents, format.number, t) },
  ];
  if (scope === "site") {
    rows.push({ label: t("history"), value: estimateLabel(historyCents, format.number, t) });
  }
  rows.push({
    label: t("linkRows", { count: resultLimit }),
    value: estimateLabel(rowsCents, format.number, t),
  });
  rows.push({
    label: t("loadMore"),
    value:
      moreRowsCents == null
        ? t("unavailable")
        : t("perHundred", { price: formatResearchEstimateCents(moreRowsCents, format.number) }),
  });

  return (
    <PricingPopover
      anchor={anchor}
      eyebrow={t("eyebrow")}
      footer={t("description")}
      onClose={onClose}
      rows={rows}
    />
  );
}
