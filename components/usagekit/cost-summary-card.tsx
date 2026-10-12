"use client";

import type {
  MeasurementCardLabels,
  MeasurementCardProps,
} from "@/components/usagekit/measurement-card";
import { MeasurementCertainty, MeasurementValue } from "@/components/usagekit/measurement-card";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import { usageMotion } from "@/components/usagekit/usage-motion";
import type { FundingSource } from "@usagekit/core";
import { addQuantity, formatQuantity } from "@usagekit/core";
import { useUsageSummary } from "@usagekit/react";
import type { Figure, UsageSummaryInput, UsageSummaryView } from "@usagekit/views";
import { parseProviderDecimal } from "@usagekit/views";
import type { ReactNode } from "react";

export const costSummaryCardLabels = {
  asOf: "As of",
  title: "Provider cost",
  description: "Provider charges for tracked usage in this period.",
  loading: "Loading cost summary.",
  empty: "No tracked costs in this period.",
  forbidden: "You cannot view costs for this scope.",
  failed: "Cost summary is unavailable right now.",
  incomplete: "The whole period could not be summarized. Cost is unavailable.",
  byok: "Own key",
  platform: "Platform funded",
  costOwner: "Cost owner",
  funding: "By funding source",
};
export type CostSummaryCardLabels = typeof costSummaryCardLabels;
export type CostSummaryCardProps = {
  view: UsageSummaryView | null;
  labels?: Partial<CostSummaryCardLabels>;
  measurementLabels?: Partial<MeasurementCardLabels>;
  formatFigure?: MeasurementCardProps["formatFigure"];
  formatUnit?: MeasurementCardProps["formatUnit"];
  fundingSource?: FundingSource;
  showCost?: boolean;
  showFunding?: boolean;
  showCostOwner?: boolean;
  formatCostOwner?: (owner: string) => ReactNode;
  variant?: "card" | "plain";
  metadata?: ReactNode;
  formatTime?: (iso: string) => string;
  details?: ReactNode;
};

/** Provider cost with its certainty and, when funding differs, a breakdown by source. */
export function CostSummaryCard({
  view,
  labels: custom,
  measurementLabels,
  formatFigure,
  formatUnit,
  fundingSource,
  showCost = true,
  showFunding = true,
  showCostOwner = true,
  formatCostOwner,
  variant = "card",
  metadata,
  formatTime,
  details,
}: CostSummaryCardProps) {
  const labels = { ...costSummaryCardLabels, ...custom };
  const caption = (
    <>
      {metadata}
      {view?.asOf && formatTime && (
        <p>
          {labels.asOf}: <time dateTime={view.asOf}>{formatTime(view.asOf)}</time>
        </p>
      )}
    </>
  );
  if (!showCost)
    return (
      <>
        {caption}
        {details}
      </>
    );
  const funding = fundingSource
    ? (view?.funding.filter((row) => row.fundingSource === fundingSource) ?? [])
    : (view?.funding ?? []);
  const message = !view
    ? labels.loading
    : view.state === "forbidden"
      ? labels.forbidden
      : view.state === "unavailable"
        ? labels.failed
        : view.state === "empty" || (view.complete && fundingSource && !funding.length)
          ? labels.empty
          : null;
  if (message || !view)
    return (
      <>
        {caption}
        <p
          role="status"
          className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
        >
          {message}
        </p>
        {details}
      </>
    );
  const selected = fundingSource ? fundingCost(funding) : view.cost;
  const cost = view.complete ? selected : "unavailable";
  const Surface = variant === "plain" ? "div" : Card;
  return (
    <section aria-label={labels.title} className="min-w-0">
      {caption}
      <Surface className="w-full min-w-0">
        <CardHeader>
          <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
            <CardTitle className="min-w-0 break-words leading-snug">{labels.title}</CardTitle>
            <MeasurementCertainty value={cost} labels={measurementLabels} />
          </div>
          <CardDescription>
            {view.complete ? labels.description : labels.incomplete}
          </CardDescription>
        </CardHeader>
        <CardContent className="gap-4 flex flex-col">
          <MeasurementValue
            value={cost}
            labels={measurementLabels}
            formatFigure={formatFigure}
            formatUnit={formatUnit}
          />
          {showFunding && view.complete && funding.length > 1 && (
            <div className="space-y-2 border-t border-border pt-4">
              <p className="text-xs text-fg-muted">{labels.funding}</p>
              <ul className="m-0 list-none divide-y divide-border p-0">
                {funding.map((row) => {
                  const owner = formatCostOwner ? formatCostOwner(row.costOwner) : row.costOwner;
                  return (
                    <li
                      key={row.key}
                      className="flex min-w-0 flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5"
                    >
                      <span className="min-w-0">
                        <span className="text-sm block font-medium">
                          {row.fundingSource === "byok" ? labels.byok : labels.platform}
                        </span>
                        {showCostOwner && owner !== null && owner !== undefined && owner !== "" && (
                          <span className="text-xs/relaxed block break-words text-fg-muted">
                            {labels.costOwner}: {owner}
                          </span>
                        )}
                      </span>
                      <span className="flex items-center gap-3">
                        <MeasurementValue
                          value={row.cost}
                          labels={measurementLabels}
                          size="md"
                          formatFigure={formatFigure}
                          formatUnit={formatUnit}
                        />
                        <MeasurementCertainty value={row.cost} labels={measurementLabels} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </CardContent>
      </Surface>
      {details}
    </section>
  );
}
export function CostSummaryCardPanel({
  labels,
  measurementLabels,
  formatFigure,
  formatUnit,
  fundingSource,
  showCost,
  showFunding,
  showCostOwner,
  formatCostOwner,
  variant,
  metadata,
  formatTime,
  details,
  ...input
}: UsageSummaryInput & Omit<CostSummaryCardProps, "view">) {
  const result = useUsageSummary(input);
  if (result.state === "unavailable" || result.state === "forbidden")
    return (
      <p
        role="alert"
        className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
      >
        {result.state === "forbidden"
          ? (labels?.forbidden ?? costSummaryCardLabels.forbidden)
          : (labels?.failed ?? costSummaryCardLabels.failed)}
      </p>
    );
  return (
    <CostSummaryCard
      view={result.data}
      labels={labels}
      measurementLabels={measurementLabels}
      formatFigure={formatFigure}
      formatUnit={formatUnit}
      fundingSource={fundingSource}
      showCost={showCost}
      showFunding={showFunding}
      showCostOwner={showCostOwner}
      formatCostOwner={formatCostOwner}
      variant={variant}
      metadata={metadata}
      formatTime={formatTime}
      details={details}
    />
  );
}

function fundingCost(rows: UsageSummaryView["funding"]): Figure {
  if (!rows.length) return "unavailable";
  let total = { value: 0n, scale: 0, unit: "cents" };
  let certainty: "measured" | "estimated" = "measured";
  for (const row of rows) {
    if (row.cost.certainty === "unknown") return { text: "", unit: "cents", certainty: "unknown" };
    const amount = parseProviderDecimal(row.cost.text, "cents");
    if (amount.outcome !== "valid") return "unavailable";
    total = addQuantity(total, amount.quantity);
    if (row.cost.certainty === "estimated") certainty = "estimated";
  }
  return { text: formatQuantity(total), unit: "cents", certainty };
}
