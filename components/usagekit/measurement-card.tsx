"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import type { UsageTone } from "@/components/usagekit/usage-motion";
import { UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import type { Figure } from "@usagekit/views";

export const measurementCardLabels = {
  measured: "Measured",
  estimated: "Estimated",
  unknown: "Unknown",
  unavailable: "Unavailable",
  cents: "cents",
};
export type MeasurementCardLabels = typeof measurementCardLabels;
export type MeasurementCardProps = {
  title: string;
  value: Figure;
  description?: string;
  labels?: Partial<MeasurementCardLabels>;
  /** "plain" drops the card chrome so several measurements can share one surface. */
  variant?: "card" | "plain";
  className?: string;
  formatFigure?: (value: Exclude<Figure, "unavailable">) => string;
  formatUnit?: (unit: string) => string;
};

const certaintyTone: Record<"measured" | "estimated" | "unknown" | "unavailable", UsageTone> = {
  measured: "positive",
  estimated: "neutral",
  unknown: "unknown",
  unavailable: "unknown",
};

/** Exact measurement text and its certainty. Unknown and unavailable never display zero. */
export function MeasurementValue({
  value,
  labels: custom,
  size = "lg",
  formatFigure,
  formatUnit,
}: {
  value: Figure;
  labels?: Partial<MeasurementCardLabels>;
  size?: "lg" | "md";
  formatFigure?: MeasurementCardProps["formatFigure"];
  formatUnit?: MeasurementCardProps["formatUnit"];
}) {
  const labels = { ...measurementCardLabels, ...custom };
  const missing =
    value === "unavailable"
      ? labels.unavailable
      : value.certainty === "unknown"
        ? labels.unknown
        : null;
  if (missing !== null || value === "unavailable")
    return (
      <p
        className={`font-semibold text-fg-muted ${size === "lg" ? "text-2xl tracking-tight" : "text-base leading-snug"}`}
      >
        {missing}
      </p>
    );
  return (
    <p className="flex min-w-0 flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
      <span
        key={formatFigure?.(value) ?? value.text}
        className={`min-w-0 break-all font-semibold tabular-nums ${size === "lg" ? "text-3xl leading-none tracking-tight" : "text-base leading-snug"} ${usageMotion.enter}`}
      >
        {formatFigure?.(value) ?? value.text}
      </span>
      {value.unit && (
        <span className="text-sm text-fg-muted">
          {formatUnit?.(value.unit) ??
            (["customer_cents", "cents"].includes(value.unit) ? labels.cents : value.unit)}
        </span>
      )}
    </p>
  );
}

/** Certainty in words with its tone. */
export function MeasurementCertainty({
  value,
  labels: custom,
}: {
  value: Figure;
  labels?: Partial<MeasurementCardLabels>;
}) {
  const labels = { ...measurementCardLabels, ...custom };
  const certainty = value === "unavailable" ? "unavailable" : value.certainty;
  return (
    <UsageStatus key={certainty} tone={certaintyTone[certainty]} className={usageMotion.enter}>
      {labels[certainty]}
    </UsageStatus>
  );
}

export function MeasurementCard({
  title,
  value,
  description,
  labels,
  variant = "card",
  className = "",
  formatFigure,
  formatUnit,
}: MeasurementCardProps) {
  const certainty = value === "unavailable" ? "unavailable" : value.certainty;
  if (variant === "plain")
    return (
      <div className={`min-w-0 space-y-3 ${className}`} data-certainty={certainty}>
        <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
          <p className="text-sm min-w-0 break-words font-medium">{title}</p>
          <MeasurementCertainty value={value} labels={labels} />
        </div>
        {description && <p className="text-xs/relaxed text-fg-muted">{description}</p>}
        <MeasurementValue
          value={value}
          labels={labels}
          formatFigure={formatFigure}
          formatUnit={formatUnit}
        />
      </div>
    );
  return (
    <Card className={`w-full min-w-0 ${className}`} data-certainty={certainty}>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <CardTitle className="min-w-0 break-words leading-snug">{title}</CardTitle>
          <MeasurementCertainty value={value} labels={labels} />
        </div>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>
        <MeasurementValue
          value={value}
          labels={labels}
          formatFigure={formatFigure}
          formatUnit={formatUnit}
        />
      </CardContent>
    </Card>
  );
}
