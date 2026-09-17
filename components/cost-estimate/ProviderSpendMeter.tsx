import {
  buildSpendSegments,
  type ProviderSpendInput,
  type SpendSegment,
} from "@/components/cost-estimate/provider-spend-segments";
import {
  type SpendTone,
  spendFillClass,
  spendTone,
  spendToneTextClass,
} from "@/components/cost-estimate/spend-tone";
import { projectedMonthlySpendCents } from "@/lib/cost-estimate/spend-pace";
import { docsLinkProps } from "@/lib/site/site";
import { cn } from "@/lib/ui/cn";
import { useFormatter, useTranslations } from "next-intl";
import type { ReactNode } from "react";

export type { ProviderSpendInput } from "@/components/cost-estimate/provider-spend-segments";

export type ProviderSpendMeterProps = {
  action?: ReactNode;
  /** null = no cap set: bar hidden, amounts read "{spent} this month". */
  capCents: number | null;
  docsHref: string;
  /** Reference date for the card on-pace projection; stories/tests pin it. */
  now?: Date;
  /** Card only: explicit month-end projection; when omitted it is computed from `now`. */
  onPaceCents?: number | null;
  providers?: readonly ProviderSpendInput[];
  sessionCents?: number;
  spentCents: number;
  variant: "card" | "segmented";
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

function amountsText(
  spentCents: number,
  capCents: number | null,
  formatMoney: (cents: number) => string,
  t: ReturnType<typeof useTranslations<"projectCostEstimate.providerSpend">>,
) {
  if (capCents == null || capCents <= 0) {
    return t("noCapAmount", { spent: formatMoney(spentCents) });
  }
  return `${formatMoney(spentCents)} / ${formatMoney(capCents)}`;
}

function meterAria(
  spentCents: number,
  capCents: number,
  sessionCents: number | undefined,
  formatMoney: (cents: number) => string,
  t: ReturnType<typeof useTranslations<"projectCostEstimate.providerSpend">>,
) {
  // Only called with a positive cap; the no-cap state renders without meter semantics.
  const session = sessionCents == null ? "none" : formatMoney(sessionCents);
  return {
    "aria-label": t("meterAria", {
      cap: formatMoney(capCents),
      session,
      spent: formatMoney(spentCents),
    }),
    "aria-valuemax": capCents / 100,
    "aria-valuemin": 0,
    "aria-valuenow": spentCents / 100,
    role: "meter",
  } as const;
}

function DocsLink({ className, href }: Readonly<{ className?: string; href: string }>) {
  const t = useTranslations("projectCostEstimate.providerSpend");
  return (
    <a
      className={cn(
        "text-[11px] font-medium text-accent-text hover:text-accent-text hover:underline",
        className,
      )}
      href={href}
      {...docsLinkProps(href)}
    >
      {t("docs")}
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
              key={segment.kind === "other" ? segment.kind : segment.label}
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
  const format = useFormatter();
  const t = useTranslations("projectCostEstimate.providerSpend");
  return (
    <div className="flex flex-wrap items-center gap-x-3.5 gap-y-1">
      {segments.map((segment) => (
        <span
          className="flex items-center gap-[5px] whitespace-nowrap"
          key={segment.kind === "other" ? segment.kind : segment.label}
        >
          <span
            aria-hidden
            className="h-[7px] w-[7px] flex-none rounded-control"
            style={{
              backgroundColor: tone === "normal" ? segment.color : toneSegmentColor[tone],
            }}
          />
          <span className="font-sans text-[10px] text-fg-muted tabular-nums">
            {segment.kind === "other" ? t("otherProvider") : segment.label}{" "}
            {format.number(segment.spentCents / 100, { currency: "USD", style: "currency" })}
          </span>
        </span>
      ))}
    </div>
  );
}

function MeterEyebrow() {
  const t = useTranslations("projectCostEstimate.providerSpend");
  return (
    <span className="font-sans tabular-nums text-[10px] font-medium uppercase tracking-[0.08em] text-fg-muted">
      {t("eyebrow")}
    </span>
  );
}

export function ProviderSpendMeter({
  action,
  capCents,
  docsHref,
  now = new Date(),
  onPaceCents,
  providers,
  sessionCents,
  spentCents,
  variant,
}: Readonly<ProviderSpendMeterProps>) {
  const format = useFormatter();
  const t = useTranslations("projectCostEstimate.providerSpend");
  const formatMoney = (cents: number) =>
    format.number(cents / 100, { currency: "USD", style: "currency" });
  const cap = capCents ?? 0;
  const percent = spendPercent(spentCents, capCents);
  const hasCap = cap > 0;
  const tone = spendTone(percent, hasCap);
  const segments =
    providers != null && providers.length > 1 ? buildSpendSegments(providers, cap) : null;
  const aria =
    hasCap && cap > 0 ? meterAria(spentCents, cap, sessionCents, formatMoney, t) : undefined;
  const amounts =
    variant === "segmented" && hasCap
      ? t("segmentedAmount", { cap: formatMoney(cap), spent: formatMoney(spentCents) })
      : amountsText(spentCents, capCents, formatMoney, t);
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
              "font-sans text-[26px] font-semibold tracking-[-0.02em] tabular-nums",
              amountToneClass ?? "text-fg",
            )}
          >
            {formatMoney(spentCents)}
          </span>
          <span className="text-[13px] text-fg-muted">
            {hasCap ? t("cardCap", { cap: formatMoney(cap) }) : t("thisMonth")}
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
        <div className="mt-2.5 flex flex-col gap-1 font-sans text-xs tabular-nums">
          {tone === "exhausted" ? <span className="text-red-text">{t("capReached")}</span> : null}
          {sessionCents == null ? null : (
            <span className={cn(tone === "normal" ? "text-fg-muted" : spendToneTextClass[tone])}>
              {t("session", { spent: formatMoney(sessionCents) })}
            </span>
          )}
          {paceCents == null ? null : (
            <span className="text-fg-muted">{t("pace", { spent: formatMoney(paceCents) })}</span>
          )}
        </div>
        <DocsLink className="mt-2 inline-flex" href={docsHref} />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-[5px]">
      <div className="flex flex-wrap items-center justify-between gap-x-2.5 gap-y-1">
        <MeterEyebrow />
        <span className="flex items-center gap-3 whitespace-nowrap">
          <span className={cn("font-sans text-xs tabular-nums", amountToneClass ?? "text-fg")}>
            {amounts}
          </span>
          {action}
        </span>
      </div>
      {hasCap ? <MeterBar {...meterProps} heightClass="h-1" segments={segments} /> : null}
      {hasCap ? (
        <div className="flex justify-end">
          <span className="font-sans text-[10px] text-fg-muted tabular-nums">
            {t("left", { spent: formatMoney(remaining) })}
          </span>
        </div>
      ) : null}
      {segments == null ? null : <Legend segments={segments} tone={tone} />}
    </div>
  );
}
("use client");
