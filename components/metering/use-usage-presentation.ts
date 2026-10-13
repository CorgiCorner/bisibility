"use client";
import type { BudgetCardLabels } from "@/components/usagekit/budget-card";
import type { CostSummaryCardLabels } from "@/components/usagekit/cost-summary-card";
import type { ExceptionsListLabels } from "@/components/usagekit/exceptions-list";
import type { MeasurementCardLabels } from "@/components/usagekit/measurement-card";
import type { UsageOverviewCardLabels } from "@/components/usagekit/usage-overview-card";
import type { UsageSummaryCardsLabels } from "@/components/usagekit/usage-summary-cards";
import type { UsageTableLabels } from "@/components/usagekit/usage-table";
import type { BudgetRow } from "@usagekit/views";
import { useLocale, useMessages } from "next-intl";
import {
  createUsageNumberFormat,
  type UsagePresentationFigure,
  type UsagePresentationOptions,
} from "./usage-number-format";
import { useUsageDisplaySettings } from "./use-usage-display-settings";

export type { UsagePresentationOptions } from "./usage-number-format";

type ViewMessages = {
  summary: UsageSummaryCardsLabels;
  cost: CostSummaryCardLabels;
  table: UsageTableLabels;
  exceptions: ExceptionsListLabels;
  budget: BudgetCardLabels;
  overview: UsageOverviewCardLabels;
  measurement: MeasurementCardLabels;
  dimensions: Record<string, string>;
  units: Record<string, string>;
  other: Record<string, string>;
  states: Record<string, string>;
};

/** Display formatting only; exact accounting amounts remain in the source views. */
export function useUsagePresentation(options: UsagePresentationOptions = {}) {
  const locale = useLocale();
  const messages = useMessages() as unknown as { shared: { usageViews: ViewMessages } };
  const labels = messages.shared.usageViews;
  const { units, other, states } = labels;
  const { options: savedOptions } = useUsageDisplaySettings();
  const presentationOptions = { ...savedOptions, ...options };
  const numbers = createUsageNumberFormat(locale, presentationOptions);
  const unit = (value: string) =>
    numbers.showCurrency(value) ? "" : (units[value] ?? units.units);
  const figure = (value: UsagePresentationFigure) =>
    value.certainty === "unknown" ? "" : (numbers.figure(value) ?? labels.measurement.unknown);
  const date = (value: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: "UTC",
    }).format(new Date(value));
  const dimension = (key: string, value: string) =>
    key === "connection"
      ? value || other.retained
      : key === "surface"
        ? (other[value] ?? other.programmatic)
        : key === "source"
          ? (other[value] ?? value)
          : value;
  const bound = (row: BudgetRow) =>
    [
      row.kind === "group"
        ? [other.project, row.target !== "project" ? row.target : null].filter(Boolean).join(" · ")
        : row.target,
      row.traffic.kind === "any"
        ? other.any
        : row.traffic.kind === "surface"
          ? (other[row.traffic.surface] ?? other.programmatic)
          : row.traffic.source,
      unit(row.unit),
    ]
      .filter(Boolean)
      .join(" · ");
  return {
    options: presentationOptions,
    summary: labels.summary,
    cost: labels.cost,
    table: labels.table,
    exceptions: labels.exceptions,
    budget: labels.budget,
    overview: labels.overview,
    measurement: labels.measurement,
    dimensions: labels.dimensions,
    unit,
    figure,
    date,
    dimension,
    bound,
    state: (value: string) => states[value] ?? states.pending,
    operation: (value: string) => other[value] ?? other.operation,
    age: (seconds: number) =>
      new Intl.NumberFormat(locale, {
        style: "unit",
        unit:
          seconds < 60 ? "second" : seconds < 3600 ? "minute" : seconds < 86400 ? "hour" : "day",
        unitDisplay: "short",
      }).format(
        Math.floor(
          seconds / (seconds < 60 ? 1 : seconds < 3600 ? 60 : seconds < 86400 ? 3600 : 86400),
        ),
      ),
  };
}
