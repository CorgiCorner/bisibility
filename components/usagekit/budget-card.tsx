"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import { UsageMark, UsageTrack } from "@/components/usagekit/usage-meter";
import type { UsageTone } from "@/components/usagekit/usage-motion";
import { UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import { useBudgetsView } from "@usagekit/react";
import type { AlertAt, BudgetRow, BudgetsInput, Figure, Limit } from "@usagekit/views";

export const budgetCardLabels = {
  used: "Used",
  reserved: "Reserved",
  remaining: "Remaining",
  limit: "Limit",
  hardLimit: "Hard limit",
  alert: "Alert",
  resets: "Resets",
  noReset: "No reset",
  unlimited: "Unlimited",
  unavailable: "Unavailable",
  unknown: "Unknown",
  redacted: "This shared budget applies, but its figures are hidden from you.",
  block: "Blocks at the limit",
  allow: "Allows overage",
  ok: "Within budget",
  warning: "Warning",
  exceeded: "Over limit",
  loading: "Loading budgets.",
  empty: "No budgets apply.",
  forbidden: "You cannot view these budgets.",
  failed: "Budgets are unavailable right now.",
};
export type BudgetCardLabels = typeof budgetCardLabels;
/** The row fields a card presents; hosts with native accounting can supply just these. */
export type BudgetCardRow = Pick<
  BudgetRow,
  | "alerts"
  | "bar"
  | "level"
  | "kind"
  | "target"
  | "boundary"
  | "resetsAt"
  | "redacted"
  | "used"
  | "reserved"
  | "remaining"
  | "limit"
>;

const tone: Record<BudgetRow["level"], UsageTone> = {
  ok: "positive",
  warning: "warning",
  exceeded: "exceeded",
  unavailable: "unknown",
};

function figure(
  value: Figure | Limit,
  labels: BudgetCardLabels,
  formatFigure?: BudgetCardProps["formatFigure"],
  formatUnit?: BudgetCardProps["formatUnit"],
): string {
  if (value === "unavailable") return labels.unavailable;
  if (value === "unlimited") return labels.unlimited;
  if (value.certainty === "unknown") return labels.unknown;
  const unit = value.unit ? (formatUnit?.(value.unit) ?? value.unit) : "";
  return [formatFigure?.(value) ?? value.text, unit].filter(Boolean).join(" ");
}
/** An ISO instant reads as "2026-11-01 00:00 UTC"; hosts pass formatTime for local formats. */
function utcMinute(iso: string): string {
  const match = /^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})(:\d{2}(\.\d+)?)?Z$/.exec(iso);
  return match ? `${match[1]} ${match[2]} UTC` : iso;
}
function threshold(at: AlertAt, format: (value: Figure | Limit) => string): string {
  return "percent" in at ? `${at.percent}%` : format(at);
}

export type BudgetCardProps = {
  row: BudgetCardRow;
  /** Heading for the budget; defaults to the scope kind and target. */
  title?: string;
  labels?: Partial<BudgetCardLabels>;
  formatTime?: (iso: string) => string;
  /** Formats known amounts for display; the row remains the source of meter semantics. */
  formatFigure?: (value: Exclude<Figure, "unavailable">) => string;
  formatUnit?: (unit: string) => string;
  className?: string;
};

/** One budget with used and reserved figures, its limits on the scale and the reset time. */
export function BudgetCard({
  row,
  title,
  labels: custom,
  formatTime = utcMinute,
  formatFigure,
  formatUnit,
  className = "",
}: BudgetCardProps) {
  const labels = { ...budgetCardLabels, ...custom };
  const format = (value: Figure | Limit) => figure(value, labels, formatFigure, formatUnit);
  const bar = row.level === "unavailable" ? null : row.bar;
  const marks = bar
    ? [
        ...(bar.hardLimit !== null
          ? [
              {
                key: "limit",
                at: bar.limit,
                tone: "bg-fg",
                label: `${labels.limit} ${format(row.limit)}`,
              },
            ]
          : []),
        ...(bar.hardLimit !== null && row.boundary.onExceed === "allow"
          ? [
              {
                key: "hard",
                at: bar.hardLimit,
                tone: "bg-red",
                label: `${labels.hardLimit} ${format(row.boundary.hardLimit ?? "unavailable")}`,
              },
            ]
          : []),
        ...row.alerts.flatMap((alert, index) => {
          const at = bar.alerts[index];
          return at === undefined
            ? []
            : [
                {
                  key: alert.key,
                  at,
                  tone: alert.crossed ? "bg-yellow" : "bg-fg-muted/70",
                  label: `${labels.alert} ${threshold(alert.at, format)}`,
                },
              ];
        }),
      ]
    : [];
  const used = format(row.used);
  const level = row.level === "unavailable" ? labels.unavailable : labels[row.level];
  return (
    <Card data-level={row.level} className={`min-w-0 ${className}`}>
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-x-3 gap-y-1">
          <CardTitle className="min-w-0 break-words leading-snug">
            {title ?? `${row.kind} ${row.target}`}
          </CardTitle>
          <UsageStatus key={row.level} tone={tone[row.level]} className={usageMotion.enter}>
            {level}
          </UsageStatus>
        </div>
        <CardDescription className="text-xs/relaxed flex flex-wrap gap-x-3 gap-y-0.5">
          <span>{row.boundary.onExceed === "block" ? labels.block : labels.allow}</span>
          <span className="tabular-nums">
            {row.resetsAt ? (
              <>
                {labels.resets} <time dateTime={row.resetsAt}>{formatTime(row.resetsAt)}</time>
              </>
            ) : (
              labels.noReset
            )}
          </span>
        </CardDescription>
      </CardHeader>
      <CardContent className="gap-4 flex min-w-0 flex-col">
        {row.redacted ? (
          <p className="rounded-lg px-3.5 py-3 text-sm border border-dashed border-border text-fg-muted">
            {labels.redacted}
          </p>
        ) : (
          <>
            <dl className="grid min-w-0 grid-cols-3 gap-x-4 gap-y-3">
              <div className="col-span-3 min-w-0">
                <dt className="text-xs text-fg-muted">{labels.used}</dt>
                <dd
                  key={used}
                  className={`text-2xl tracking-tight mt-1 break-words font-semibold tabular-nums ${row.level === "exceeded" ? "text-red-text" : ""} ${usageMotion.enter}`}
                >
                  {used}
                </dd>
              </div>
              {[
                [labels.reserved, format(row.reserved)],
                [labels.remaining, format(row.remaining)],
                [labels.limit, format(row.limit)],
              ].map(([label, value]) => (
                <div key={label} className="min-w-0">
                  <dt className="text-xs text-fg-muted">{label}</dt>
                  <dd className="text-sm mt-1 break-words font-medium tabular-nums">{value}</dd>
                </div>
              ))}
            </dl>
            {bar && (
              <UsageTrack
                level={row.level === "unavailable" ? "ok" : row.level}
                fill={`${bar.used}%`}
                reserved={`${bar.reserved}%`}
                trace={
                  row.used !== "unavailable" &&
                  row.used.certainty !== "unknown" &&
                  row.used.text !== "" &&
                  !/^0+(?:\.0+)?$/.test(row.used.text)
                }
                className="mt-1"
                marks={marks.map((mark) => (
                  <UsageMark
                    key={mark.key}
                    at={`${mark.at}%`}
                    label={mark.label}
                    tone={mark.tone}
                  />
                ))}
              />
            )}
            {marks.length > 0 && (
              <ul
                aria-hidden
                className="text-xs m-0 flex list-none flex-wrap gap-x-4 gap-y-1 p-0 text-fg-muted tabular-nums"
              >
                {marks.map((mark) => (
                  <li key={mark.key} className="inline-flex items-center gap-1.5">
                    <span className={`h-3 w-px ${mark.tone}`} />
                    {mark.label}
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function PanelMessage({ role, children }: { role: "alert" | "status"; children: string }) {
  return (
    <p
      role={role}
      className={`rounded-lg border border-dashed px-4 py-3.5 text-sm border-border text-fg-muted ${usageMotion.enter}`}
    >
      {children}
    </p>
  );
}

/** Every applicable budget as a card, read with useBudgetsView inside a MeterProvider. */
export function BudgetCardsPanel({
  labels,
  formatTime,
  formatFigure,
  formatUnit,
  ...input
}: BudgetsInput & Pick<BudgetCardProps, "labels" | "formatTime" | "formatFigure" | "formatUnit">) {
  const result = useBudgetsView(input);
  const text = { ...budgetCardLabels, ...labels };
  if (result.state === "unavailable" || result.state === "forbidden")
    return (
      <PanelMessage role="alert">
        {result.state === "forbidden" ? text.forbidden : text.failed}
      </PanelMessage>
    );
  if (!result.data)
    return (
      <div role="status" className="grid gap-4 sm:grid-cols-2">
        <span className="sr-only">{text.loading}</span>
        {[0, 1].map((key) => (
          <span
            key={key}
            aria-hidden
            className="rounded-xl bg-fg/[0.05] block h-52 animate-pulse motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  if (result.data.state !== "ok")
    return (
      <PanelMessage role="status">
        {result.data.state === "empty"
          ? text.empty
          : result.data.state === "forbidden"
            ? text.forbidden
            : text.failed}
      </PanelMessage>
    );
  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {result.data.rows.map((row) => (
        <BudgetCard
          key={row.id}
          row={row}
          labels={labels}
          formatTime={formatTime}
          formatFigure={formatFigure}
          formatUnit={formatUnit}
        />
      ))}
    </div>
  );
}
