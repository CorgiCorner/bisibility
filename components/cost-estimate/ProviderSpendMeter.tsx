import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { formatMoneyCents } from "@/lib/format/money";
import { docsLinkProps } from "@/lib/site/site";
import { cn } from "@/lib/ui/cn";
import type { ReactNode } from "react";
import {
  buildSpendSegments,
  type ProviderSpendInput,
  type SpendSegment,
} from "./provider-spend-segments";
import { SpendMeterDocsInfo } from "./SpendMeterDocsInfo";

export type { ProviderSpendInput } from "./provider-spend-segments";

export type ProviderSpendMeterProps = {
  /** Segmented only: extra row-1 control between the amounts and the docs link. */
  action?: ReactNode;
  /** null = no cap set: bar hidden, amounts read "{spent} this month". */
  capCents: number | null;
  docsHref: string;
  /** Header only: workspace settings target shown in the spend tooltip. */
  editBudgetHref?: string;
  /** Reference date for the card on-pace projection; stories/tests pin it. */
  now?: Date;
  /** Card only: explicit month-end projection; when omitted it is computed from `now`. */
  onPaceCents?: number | null;
  /** Per-provider spend powering segments and the legend (segmented and card contexts). */
  providers?: readonly ProviderSpendInput[];
  sessionCents?: number;
  spentCents: number;
  variant: "card" | "header" | "segmented";
};

type Tone = "exhausted" | "normal" | "warning";

function spendPercent(spentCents: number, capCents: number | null) {
  if (capCents == null || capCents <= 0) {
    return 0;
  }
  return Math.min(100, Math.max(0, (spentCents / capCents) * 100));
}

function spendTone(percent: number, capCents: number | null): Tone {
  if (capCents == null || capCents <= 0) return "normal";
  if (percent >= 100) return "exhausted";
  if (percent >= 80) return "warning";
  return "normal";
}

const fillClass: Record<Tone, string> = {
  exhausted: "bg-red",
  normal: "bg-accent",
  warning: "bg-yellow",
};

const toneTextClass: Record<Exclude<Tone, "normal">, string> = {
  exhausted: "text-red-text",
  warning: "text-yellow-text",
};

/** Threshold recolors win over segmentation: bar and legend go single-color. */
const toneSegmentColor: Record<Exclude<Tone, "normal">, string> = {
  exhausted: "var(--red)",
  warning: "var(--yellow)",
};

function amountsText(spentCents: number, capCents: number | null) {
  if (capCents == null || capCents <= 0) {
    return `${formatMoneyCents(spentCents)} this month`;
  }
  return `${formatMoneyCents(spentCents)} / ${formatMoneyCents(capCents)}`;
}

function metaText(tone: Tone, percent: number) {
  if (tone === "exhausted") return "cap reached";
  if (tone === "warning") return `${Math.round(percent)}% of cap`;
  return null;
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
  heightClass,
  percent,
  segments,
  tone,
}: Readonly<{
  heightClass: string;
  percent: number;
  segments: SpendSegment[] | null;
  tone: Tone;
}>) {
  const segmented = segments != null && tone === "normal";
  // --meter-track, not a recessed fill: in dark mode --bg-sunken sits below --bg, so a
  // track drawn with it disappears on the header background (and at $0 spend the track
  // is the only thing there is to see).
  return (
    <div className={cn("w-full overflow-hidden rounded-full bg-meter-track", heightClass)}>
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
          className={cn("h-full rounded-full transition-[width]", fillClass[tone])}
          style={{ width: `${percent}%` }}
        />
      )}
    </div>
  );
}

function totalSpend(segments: readonly SpendSegment[]) {
  return segments.reduce((total, segment) => total + segment.spentCents, 0) || 1;
}

function Legend({ segments, tone }: Readonly<{ segments: SpendSegment[]; tone: Tone }>) {
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {segments.map((segment) => (
        <span className="flex items-center gap-[5px] whitespace-nowrap" key={segment.label}>
          <span
            aria-hidden
            className="h-[7px] w-[7px] flex-none rounded-[2px]"
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

function MeterEyebrow() {
  return (
    <span className="font-mono text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
      PROVIDER SPEND
    </span>
  );
}

export function ProviderSpendMeter({
  action,
  capCents,
  docsHref,
  editBudgetHref,
  now = new Date(),
  onPaceCents,
  providers,
  sessionCents,
  spentCents,
  variant,
}: Readonly<ProviderSpendMeterProps>) {
  const cap = capCents ?? 0;
  const percent = spendPercent(spentCents, capCents);
  const tone = spendTone(percent, capCents);
  const hasCap = cap > 0;
  // The cap is per workspace: always one aggregate bar. Segments and legend render
  // only outside the compact header, and only with more than one provider.
  const segments =
    variant !== "header" && providers != null && providers.length > 1
      ? buildSpendSegments(providers, cap)
      : null;
  const aria = hasCap ? meterAria(spentCents, cap, sessionCents) : {};
  const amounts = amountsText(spentCents, capCents);
  const meta = metaText(tone, percent);
  const amountToneClass = tone === "normal" ? null : toneTextClass[tone];
  const metaToneClass = tone === "normal" ? "text-fg-muted" : toneTextClass[tone];

  if (variant === "card") {
    const paceCents =
      onPaceCents !== undefined ? onPaceCents : projectedMonthlySpendCents(spentCents, now);
    return (
      <div className="rounded-xl border border-border bg-bg-elev px-5 py-[18px]" {...aria}>
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
            <MeterBar heightClass="h-1.5" percent={percent} segments={segments} tone={tone} />
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
            <span className={cn(tone === "normal" ? "text-fg-muted" : toneTextClass[tone])}>
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
      <div className="flex flex-col gap-[5px]" {...aria}>
        <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
          <MeterEyebrow />
          {/* Row-1 order per HANDOFF-35 4a: amounts, optional action, docs link, 12px gaps. */}
          <span className="flex items-center gap-3 whitespace-nowrap">
            <span className={cn("font-mono text-xs tabular-nums", amountToneClass ?? "text-fg")}>
              {amounts}
            </span>
            {action}
            <DocsLink href={docsHref} />
          </span>
        </div>
        {hasCap ? (
          <MeterBar heightClass="h-1" percent={percent} segments={segments} tone={tone} />
        ) : null}
        {segments == null ? null : <Legend segments={segments} tone={tone} />}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[5px]" {...aria}>
      <div className="flex items-baseline justify-between gap-2.5 whitespace-nowrap">
        <span className="inline-flex items-center gap-1">
          <MeterEyebrow />
          <SpendMeterDocsInfo
            docsHref={docsHref}
            editBudgetHref={editBudgetHref}
            sessionCents={sessionCents}
          />
        </span>
        <span
          className={cn(
            "font-mono text-[10px] tracking-[0.04em] tabular-nums",
            amountToneClass ?? "text-fg-muted",
          )}
        >
          {amounts}
        </span>
      </div>
      {hasCap ? <MeterBar heightClass="h-1" percent={percent} segments={null} tone={tone} /> : null}
      {meta == null ? null : (
        <span className={cn("font-mono text-[11px] tabular-nums", metaToneClass)}>{meta}</span>
      )}
    </div>
  );
}
