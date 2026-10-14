"use client";

import type {
  MeasurementCardLabels,
  MeasurementCardProps,
} from "@/components/usagekit/measurement-card";
import { MeasurementCard } from "@/components/usagekit/measurement-card";
import { Card } from "@/components/usagekit/primitives/card";
import { usageMotion } from "@/components/usagekit/usage-motion";
import type { FundingSource } from "@usagekit/core";
import { addQuantity, formatQuantity } from "@usagekit/core";
import { useUsageSummary } from "@usagekit/react";
import type { Figure, UsageSummaryInput, UsageSummaryView } from "@usagekit/views";
import { parseProviderDecimal } from "@usagekit/views";
import type { ReactNode } from "react";

export const usageSummaryCardsLabels = {
  asOf: "As of",
  title: "Usage",
  customerCharges: "Customer charges",
  loading: "Loading usage summary.",
  empty: "No usage in this period.",
  forbidden: "You cannot view usage for this scope.",
  failed: "Usage summary is unavailable right now.",
  incomplete: "The summary could not cover the whole period. Narrow the period and try again.",
  unknownOperations: "Operations with unknown measurements",
};
export type UsageSummaryCardsLabels = typeof usageSummaryCardsLabels;
export type UsageSummaryCardsProps = {
  view: UsageSummaryView | null;
  labels?: Partial<UsageSummaryCardsLabels>;
  measurementLabels?: Partial<MeasurementCardLabels>;
  unitLabels?: Partial<Record<string, string>>;
  formatFigure?: MeasurementCardProps["formatFigure"];
  formatUnit?: MeasurementCardProps["formatUnit"];
  fundingSource?: FundingSource;
  /** Select from complete funding evidence; never reconstruct incomplete totals. */
  selectMeasurements?: (view: UsageSummaryView) => UsageSummaryView["measurements"];
  variant?: "card" | "plain";
  metadata?: ReactNode;
  formatTime?: (iso: string) => string;
  details?: ReactNode;
};

// A separator belongs to a pair of cells, never to the outer edge or an empty slot.
function cellClass(index: number, count: number) {
  const smColumns = Math.min(count, 2);
  const xlColumns = Math.min(count, 3);
  return [
    "p-4 min-w-0 border-border",
    index + 1 < count ? "border-b" : "border-b-0",
    index + smColumns < count ? "sm:border-b" : "sm:border-b-0",
    index % smColumns < smColumns - 1 && index + 1 < count ? "sm:border-e" : "sm:border-e-0",
    index + xlColumns < count ? "xl:border-b" : "xl:border-b-0",
    index % xlColumns < xlColumns - 1 && index + 1 < count ? "xl:border-e" : "xl:border-e-0",
  ].join(" ");
}

/** Complete totals per unit on one surface, each with its certainty. */
export function UsageSummaryCards({
  view,
  labels: custom,
  measurementLabels,
  unitLabels = {},
  formatFigure,
  formatUnit,
  fundingSource,
  selectMeasurements,
  variant = "card",
  metadata,
  formatTime,
  details,
}: UsageSummaryCardsProps) {
  const labels = { ...usageSummaryCardsLabels, ...custom };
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
  if (!view)
    return (
      <div role="status" className="rounded-xl border grid gap-px overflow-hidden border-border">
        <span className="sr-only">{labels.loading}</span>
        <span
          aria-hidden
          className="block h-32 animate-pulse bg-fg/[0.04] motion-reduce:animate-none"
        />
      </div>
    );
  const funding = fundingSource
    ? view.funding.filter((row) => row.fundingSource === fundingSource)
    : view.funding;
  const unknownOperations = fundingSource
    ? funding.reduce((total, row) => total + BigInt(row.unknownOperations), 0n).toString()
    : view.unknownOperations;
  const message =
    view.state === "forbidden"
      ? labels.forbidden
      : view.state === "unavailable"
        ? labels.failed
        : view.state === "empty" || (view.complete && fundingSource && !funding.length)
          ? labels.empty
          : !view.complete
            ? labels.incomplete
            : null;
  if (message)
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
  const measurements =
    selectMeasurements?.(view) ??
    (fundingSource
      ? funding.reduce<Record<string, Figure>>((result, row) => {
          for (const [unit, value] of Object.entries(row.measurements)) {
            if (!(unit in result)) result[unit] = value;
            else result[unit] = addSummaryFigure(result[unit]!, value, unit);
          }
          return result;
        }, {})
      : view.measurements);
  const entries = Object.entries(measurements);
  const Surface = variant === "plain" ? "div" : Card;
  return (
    <section aria-label={labels.title} className="min-w-0 space-y-3">
      {caption}
      <Surface className="gap-0 overflow-hidden p-0">
        <div
          className={`grid min-w-0 ${entries.length > 1 ? "sm:grid-cols-2" : ""} ${entries.length > 2 ? "xl:grid-cols-3" : ""}`}
        >
          {entries.map(([unit, value], index) => (
            <div key={unit} className={cellClass(index, entries.length)}>
              <MeasurementCard
                variant="plain"
                title={
                  unitLabels[unit] ??
                  formatUnit?.(unit) ??
                  (unit === "customer_cents" ? labels.customerCharges : unit)
                }
                value={value}
                labels={measurementLabels}
                formatFigure={formatFigure}
                formatUnit={formatUnit}
              />
            </div>
          ))}
        </div>
      </Surface>
      {details}
      {unknownOperations !== null && unknownOperations !== "0" && (
        <p className="text-sm text-fg-muted tabular-nums">
          {labels.unknownOperations}: {unknownOperations}
        </p>
      )}
    </section>
  );
}
export function UsageSummaryCardsPanel({
  labels,
  measurementLabels,
  unitLabels,
  formatFigure,
  formatUnit,
  fundingSource,
  selectMeasurements,
  variant,
  metadata,
  formatTime,
  details,
  ...input
}: UsageSummaryInput & Omit<UsageSummaryCardsProps, "view">) {
  const result = useUsageSummary(input);
  if (result.state === "unavailable" || result.state === "forbidden")
    return (
      <p
        role="alert"
        className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
      >
        {result.state === "forbidden"
          ? (labels?.forbidden ?? usageSummaryCardsLabels.forbidden)
          : (labels?.failed ?? usageSummaryCardsLabels.failed)}
      </p>
    );
  return (
    <UsageSummaryCards
      view={result.data}
      labels={labels}
      measurementLabels={measurementLabels}
      unitLabels={unitLabels}
      formatFigure={formatFigure}
      formatUnit={formatUnit}
      fundingSource={fundingSource}
      selectMeasurements={selectMeasurements}
      variant={variant}
      metadata={metadata}
      formatTime={formatTime}
      details={details}
    />
  );
}

/** Preserve exact quantities and weakest certainty when selecting more than one funding row. */
export function addSummaryFigure(a: Figure, b: Figure, unit: string): Figure {
  if (a === "unavailable" || b === "unavailable") return "unavailable";
  if (a.certainty === "unknown" || b.certainty === "unknown")
    return { text: "", unit, certainty: "unknown" };
  const x = parseProviderDecimal(a.text, unit),
    y = parseProviderDecimal(b.text, unit);
  if (x.outcome !== "valid" || y.outcome !== "valid") return "unavailable";
  return {
    text: formatQuantity(addQuantity(x.quantity, y.quantity)),
    unit,
    certainty:
      a.certainty === "estimated" || b.certainty === "estimated" ? "estimated" : "measured",
  };
}
