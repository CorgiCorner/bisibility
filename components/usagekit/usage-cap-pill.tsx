"use client";

import { Badge } from "@/components/usagekit/primitives/badge";
import { UsageMeter, UsageTrack } from "@/components/usagekit/usage-meter";
import { usageMotion } from "@/components/usagekit/usage-motion";
import { usageProgress } from "@/components/usagekit/usage-progress";
import type { BudgetRow, Figure, HeaderBound } from "@usagekit/views";
import { parseProviderDecimal } from "@usagekit/views";
import type { ReactNode } from "react";

export const usageCapPillLabels = { unknown: "Usage unknown", unavailable: "Usage unavailable" };
export type UsageCapPillLabels = typeof usageCapPillLabels;
export type UsageCapLinkProps = {
  href: string;
  "aria-label": string;
  className: string;
  children: ReactNode;
};
export type UsageCapPillProps = {
  state: "hidden" | "unavailable" | "ready";
  label?: string;
  ariaLabel?: string;
  href?: string;
  percent?: number | null;
  partial?: boolean;
  /** "sm" sits beside compact header chips; "md" is the default height. */
  size?: "sm" | "md";
  className?: string;
  labels?: Partial<UsageCapPillLabels>;
  renderLink?: (props: UsageCapLinkProps) => ReactNode;
  /** Meter-bound status, including actual alerts and soft/hard policy. */
  level?: "ok" | "warning" | "exceeded";
  renderTooltip?: (trigger: ReactNode) => ReactNode;
};

const sizeClass = { sm: "h-6 gap-1.5 px-2 text-[11px]", md: "h-7 gap-2 px-2.5 text-xs" } as const;
const levelClass = {
  ok: "border-border",
  warning: "border-yellow/70",
  exceeded: "border-red/50 text-red-text",
} as const;

/** Compact host-authoritative usage. Routing and localized copy belong to the host. */
export function UsageCapPill({
  state,
  label,
  ariaLabel,
  href,
  percent = null,
  partial = false,
  size = "md",
  className = "",
  labels: custom,
  level: hostLevel,
  renderTooltip,
  renderLink = (props) => <a {...props} />,
}: UsageCapPillProps) {
  const labels = { ...usageCapPillLabels, ...custom };
  if (state === "hidden") return null;
  if (state === "unavailable")
    return (
      <Badge
        data-usagekit="usage-cap-pill"
        variant="outline"
        role="status"
        className={`rounded-full border font-medium leading-none normal-case tracking-normal border-dashed bg-transparent text-fg-muted ${sizeClass[size]} ${className}`}
      >
        {labels.unavailable}
      </Badge>
    );
  const progress = usageProgress(percent, partial);
  const level = hostLevel ?? progress.level;
  const unknown = progress.kind === "unknown";
  const text = unknown ? labels.unknown : (label ?? labels.unknown);
  const content = (
    <span
      data-usagekit="usage-cap-pill"
      data-coverage={progress.kind}
      data-level={level}
      className="inline-flex min-w-0 items-center gap-[inherit]"
    >
      {hostLevel && progress.percent !== null ? (
        <UsageTrack
          aria-hidden
          size="sm"
          level={hostLevel}
          fill={`${Math.min(100, progress.percent)}%`}
          partial={partial}
          over={progress.percent > 100}
          className={size === "sm" ? "w-7" : "w-9"}
        />
      ) : (
        <UsageMeter
          size="sm"
          percent={percent}
          partial={partial}
          className={progress.kind === "none" ? "w-4" : size === "sm" ? "w-7" : "w-9"}
        />
      )}
      <span key={text} className={`min-w-0 truncate ${usageMotion.enter}`}>
        {text}
      </span>
    </span>
  );
  const pillClass = `rounded-full border font-medium leading-none normal-case tracking-normal bg-bg-sunken inline-flex max-w-full items-center tabular-nums text-fg ${sizeClass[size]} ${levelClass[unknown ? "ok" : level]} ${className}`;
  const result = href ? (
    renderLink({
      href,
      "aria-label": unknown ? labels.unknown : (ariaLabel ?? text),
      className: `${pillClass} hover:bg-bg-inset [&:hover_[data-usage-track]>span:first-child]:bg-fg/10 outline-none focus-visible:ring-2 focus-visible:ring-accent-solid no-underline ${usageMotion.respond}`,
      children: content,
    })
  ) : (
    <span role="status" className={pillClass}>
      {content}
    </span>
  );
  return renderTooltip ? renderTooltip(result) : result;
}

/** Exact lower-bound percentage, floored to hundredths. Remaining already includes reservations. */
export function usageCapFromBound(
  bound: HeaderBound,
  presentation: Pick<UsageCapPillProps, "label" | "ariaLabel" | "href" | "renderLink"> = {},
): UsageCapPillProps {
  const base: UsageCapPillProps = {
    ...presentation,
    state: "ready",
    percent: null,
    level: bound.level,
    partial: false,
  };
  if (
    typeof bound.of === "string" ||
    typeof bound.remaining === "string" ||
    bound.of.certainty === "unknown" ||
    bound.remaining.certainty === "unknown"
  )
    return base;
  const limit = parseProviderDecimal(bound.of.text, bound.unit),
    left = parseProviderDecimal(bound.remaining.text, bound.unit);
  if (limit.outcome !== "valid" || left.outcome !== "valid") return base;
  const scale = Math.max(limit.quantity.scale, left.quantity.scale);
  const total = limit.quantity.value * 10n ** BigInt(scale - limit.quantity.scale);
  const remaining = left.quantity.value * 10n ** BigInt(scale - left.quantity.scale);
  const used = total > remaining ? total - remaining : 0n;
  const percent =
    total === 0n
      ? bound.level === "exceeded"
        ? 100
        : 0
      : Number.parseInt(
          ((used * 10000n) / total > 10000n ? 10000n : (used * 10000n) / total).toString(),
          10,
        ) / 100;
  return {
    ...base,
    percent,
    partial: bound.of.certainty !== "measured" || bound.remaining.certainty !== "measured",
  };
}

export const usageBoundLabels = {
  unknown: "Unknown",
  unavailable: "Unavailable",
  unlimited: "Unlimited",
};
export type UsageBoundPresentation = Pick<
  UsageCapPillProps,
  "href" | "renderLink" | "renderTooltip"
> & {
  labels?: Partial<typeof usageBoundLabels>;
  formatBound?: (row: BudgetRow) => string;
  formatFigure?: (figure: Exclude<Figure, "unavailable">) => string;
  formatUnit?: (unit: string) => string;
};
/** Full budget projection preserves reserved usage and soft bounds with a separate hard limit. */
export function usageCapFromBudget(
  row: BudgetRow,
  presentation: UsageBoundPresentation = {},
): UsageCapPillProps {
  const { formatBound, formatFigure, formatUnit, labels: custom, ...links } = presentation;
  const labels = { ...usageBoundLabels, ...custom };
  if (row.redacted || row.level === "unavailable") return { ...links, state: "unavailable" };
  const unit = formatUnit?.(row.unit) ?? row.unit;
  const name = formatBound?.(row) ?? `${row.kind} ${row.target}`;
  const display = (value: Figure) =>
    value === "unavailable"
      ? labels.unavailable
      : value.certainty === "unknown"
        ? labels.unknown
        : (formatFigure?.(value) ?? value.text);
  const label = `${name}: ${display(row.used)} + ${display(row.reserved)} / ${row.limit === "unlimited" ? labels.unlimited : display(row.limit)} ${unit}`;
  const props: UsageCapPillProps = {
    ...links,
    state: "ready",
    label,
    ariaLabel: label,
    level: row.level,
    percent: null,
    partial: false,
  };
  if (row.limit === "unlimited") return props;
  const limit =
    row.boundary.onExceed === "allow" && row.boundary.hardLimit
      ? row.boundary.hardLimit
      : row.limit;
  const values = [row.used, row.reserved, limit];
  if (values.some((v) => v === "unavailable" || v.certainty === "unknown")) return props;
  const quantities = values.map((v) =>
    v !== "unavailable" ? parseProviderDecimal(v.text, row.unit) : { outcome: "invalid" as const },
  );
  if (quantities.some((v) => v.outcome !== "valid")) return props;
  const parsed = quantities.map((v) => {
    if (v.outcome !== "valid") throw new Error("Unreachable");
    return v.quantity;
  });
  const scale = Math.max(...parsed.map((v) => v.scale));
  const [used = 0n, reserved = 0n, total = 0n] = parsed.map(
    (v) => v.value * 10n ** BigInt(scale - v.scale),
  );
  const ratio =
    total === 0n ? (row.level === "exceeded" ? 10000n : 0n) : ((used + reserved) * 10000n) / total;
  const safeRatio =
    ratio > BigInt(Number.MAX_SAFE_INTEGER) ? BigInt(Number.MAX_SAFE_INTEGER) : ratio;
  return {
    ...props,
    percent: Number.parseInt(safeRatio.toString(), 10) / 100,
    // Reserved is a known exposure, not incomplete coverage.
    partial: row.used !== "unavailable" && row.used.certainty === "estimated",
  };
}
