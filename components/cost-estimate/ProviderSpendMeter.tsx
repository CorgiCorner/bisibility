import {
  buildSpendSegments,
  type ProviderSpendInput,
  type SpendSegment,
} from "@/components/cost-estimate/provider-spend-segments";
import { SpendMeterDocsInfo } from "@/components/cost-estimate/SpendMeterDocsInfo";
import {
  type SpendTone,
  spendFillClass,
  spendTone,
  spendToneTextClass,
} from "@/components/cost-estimate/spend-tone";
import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { formatMoneyCents } from "@/lib/format/money";
import { docsLinkProps } from "@/lib/site/site";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";

export type { ProviderSpendInput } from "@/components/cost-estimate/provider-spend-segments";

export type ProviderSpendMeterProps = {
  action?: ReactNode;
  /** null = no cap set: bar hidden, amounts read "{spent} this month". */
  capCents: number | null;
  docsHref: string;
  headerAction?: { href: string; label: "Details" | "Set budget" };
  /** Reference date for the card on-pace projection; stories/tests pin it. */
  now?: Date;
  /** Card only: explicit month-end projection; when omitted it is computed from `now`. */
  onPaceCents?: number | null;
  providers?: readonly ProviderSpendInput[];
  recorded?: { cents: number; units: number };
  sessionCents?: number;
  spentCents: number;
  tightest?: { provider: string; usedPercent: number } | null;
  usedPercent?: number | null;
  variant: "card" | "header" | "segmented";
};

function spendPercent(spentCents: number, capCents: number | null) {
  if (capCents == null || capCents <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (spentCents / capCents) * 100));
}

/** Threshold recolors win over segmentation: bar and legend go single-color. */
const toneSegmentColor: Record<Exclude<SpendTone, "normal">, string> = {
  exhausted: "var(--red)",
  warning: "var(--yellow)",
};

function amountsText(spentCents: number, capCents: number | null) {
  if (capCents == null || capCents <= 0) {
    return `${formatMoneyCents(spentCents)} this month`;
  }
  return `${formatMoneyCents(spentCents)} / ${formatMoneyCents(capCents)}`;
}

function meterAria(spentCents: number, capCents: number, sessionCents: number | undefined) {
  // Only called with a positive cap; the no-cap state renders without meter semantics.
  const session = sessionCents == null ? "" : `, ${formatMoneyCents(sessionCents)} this session`;
  return {
    "aria-label": `Provider spend: ${formatMoneyCents(spentCents)} of ${formatMoneyCents(capCents)} this month${session}`,
    "aria-valuemax": capCents / 100,
    "aria-valuemin": 0,
    "aria-valuenow": spentCents / 100,
    role: "meter",
  } as const;
}

function DocsLink({ className, href }: Readonly<{ className?: string; href: string }>) {
  return (
    <a
      className={cn(
        "text-[11px] font-medium text-accent-text hover:text-accent-text hover:underline",
        className,
      )}
      href={href}
      {...docsLinkProps(href)}
    >
      How budgets work
    </a>
  );
}

function MeterBar({
  aria,
  heightClass,
  percent,
  segments,
  tone,
}: Readonly<{
  aria?: ReturnType<typeof meterAria>;
  heightClass: string;
  percent: number;
  segments: SpendSegment[] | null;
  tone: SpendTone;
}>) {
  const segmented = segments != null && tone === "normal";
  return (
    <div
      className={cn(
        "w-full overflow-hidden rounded-full",
        percent === 0 ? "border border-border-strong bg-transparent" : "bg-meter-track",
        heightClass,
      )}
      {...aria}
    >
      {segmented ? (
        <div className="flex h-full">
          {segments.map((segment) => (
            <div
              className="h-full flex-none"
              key={segment.label}
              style={{
                backgroundColor: segment.color,
                minWidth: segment.spentCents > 0 ? "2px" : 0,
                width: `${percent === 0 ? 0 : (segment.spentCents / totalSpend(segments)) * percent}%`,
              }}
            />
          ))}
        </div>
      ) : (
        <div
          className={cn("h-full rounded-full transition-[width]", spendFillClass[tone])}
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

function totalSpend(segments: readonly SpendSegment[]) {
  return segments.reduce((total, segment) => total + segment.spentCents, 0) || 1;
}

function Legend({ segments, tone }: Readonly<{ segments: SpendSegment[]; tone: SpendTone }>) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {segments.map((segment) => (
        <span className="flex items-center gap-[5px] whitespace-nowrap" key={segment.label}>
          <span
            aria-hidden
            className="h-[7px] w-[7px] flex-none rounded-control"
            style={{
              backgroundColor: tone === "normal" ? segment.color : toneSegmentColor[tone],
            }}
          />
          <span className="font-mono text-[10px] text-fg-muted tabular-nums">
            {segment.label} {formatMoneyCents(segment.spentCents)}
          </span>
        </span>
      ))}
    </div>
  );
}

function MeterEyebrow({ header = false }: Readonly<{ header?: boolean }>) {
  return (
    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
      {header ? "BUDGET" : "MONTHLY BUDGET"}
    </span>
  );
}

export function ProviderSpendMeter({
  action,
  capCents,
  docsHref,
  headerAction,
  now = new Date(),
  onPaceCents,
  providers,
  recorded,
  sessionCents,
  spentCents,
  tightest,
  usedPercent,
  variant,
}: Readonly<ProviderSpendMeterProps>) {
  const cap = capCents ?? 0;
  const percent =
    variant === "header" && usedPercent != null ? usedPercent : spendPercent(spentCents, capCents);
  const hasCap = variant === "header" ? usedPercent != null : cap > 0;
  const tone = spendTone(percent, hasCap);
  // The cap is per project: always one aggregate bar. Segments and legend render
  // only outside the compact header, and only with more than one provider.
  const segments =
    variant !== "header" && providers != null && providers.length > 1
      ? buildSpendSegments(providers, cap)
      : null;
  const aria = hasCap && cap > 0 ? meterAria(spentCents, cap, sessionCents) : undefined;
  const amounts =
    variant === "segmented" && hasCap
      ? `${formatMoneyCents(spentCents)} of ${formatMoneyCents(cap)} used`
      : amountsText(spentCents, capCents);
  const remaining = Math.max(0, cap - spentCents);
  const amountToneClass = tone === "normal" ? null : spendToneTextClass[tone];
  const meterProps = { aria, percent, tone };

  if (variant === "card") {
    const paceCents =
      onPaceCents !== undefined ? onPaceCents : projectedMonthlySpendCents(spentCents, now);
    return (
      <div className="rounded-card border border-border bg-bg-elev px-5 py-4.5">
        <MeterEyebrow />
        <div className="mt-2 flex flex-wrap items-baseline gap-2 whitespace-nowrap">
          <span
            className={cn(
              "font-mono text-[26px] font-semibold tracking-[-0.02em] tabular-nums",
              amountToneClass ?? "text-fg",
            )}
          >
            {formatMoneyCents(spentCents)}
          </span>
          <span className="text-[13px] text-fg-muted">
            {hasCap ? `of ${formatMoneyCents(cap)} cap` : "this month"}
          </span>
        </div>
        {hasCap ? (
          <div className="mt-2.5">
            <MeterBar {...meterProps} heightClass="h-1.5" segments={segments} />
          </div>
        ) : null}
        {segments == null ? null : (
          <div className="mt-2">
            <Legend segments={segments} tone={tone} />
          </div>
        )}
        <div className="mt-2.5 flex flex-col gap-1 font-mono text-xs tabular-nums">
          {tone === "exhausted" ? <span className="text-red-text">cap reached</span> : null}
          {sessionCents == null ? null : (
            <span className={cn(tone === "normal" ? "text-fg-muted" : spendToneTextClass[tone])}>
              {formatMoneyCents(sessionCents)} this session
            </span>
          )}
          {paceCents == null ? null : (
            <span className="text-fg-muted">on pace ~{formatMoneyCents(paceCents)}/mo</span>
          )}
        </div>
        <DocsLink className="mt-2 inline-flex" href={docsHref} />
      </div>
    );
  }

  if (variant === "segmented") {
    return (
      <div className="flex flex-col gap-[5px]">
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
          <MeterEyebrow />
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span className={cn("font-mono text-xs tabular-nums", amountToneClass ?? "text-fg")}>
              {amounts}
            </span>
            {action}
          </span>
        </div>
        {hasCap ? <MeterBar {...meterProps} heightClass="h-1" segments={segments} /> : null}
        {hasCap ? (
          <div className="flex justify-end">
            <span className="font-mono text-[10px] text-fg-muted tabular-nums">
              {formatMoneyCents(remaining)} left
            </span>
          </div>
        ) : null}
        {segments == null ? null : <Legend segments={segments} tone={tone} />}
      </div>
    );
  }

  const metered = (recorded?.cents ?? spentCents) + (sessionCents ?? 0);
  const title = recorded?.units
    ? `${formatMoneyCents(metered)} + ${recorded.units.toLocaleString("en-US")} searches recorded this month`
    : `${formatMoneyCents(metered)} recorded this month`;
  return (
    <div className="flex flex-col gap-[5px]" title={title}>
      <div className="flex items-baseline justify-between gap-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <MeterEyebrow header />
          <SpendMeterDocsInfo action={headerAction} sessionCents={sessionCents} />
        </span>
        <span className="font-mono text-[10px] tracking-[0.04em] text-fg-muted tabular-nums">
          {tightest
            ? `${tightest.provider} ${Math.round(tightest.usedPercent)}% used`
            : "No budget set"}
        </span>
      </div>
      {hasCap ? (
        <MeterBar
          heightClass="h-1"
          percent={percent}
          segments={null}
          tone={spendTone(percent, true)}
        />
      ) : null}
    </div>
  );
}
