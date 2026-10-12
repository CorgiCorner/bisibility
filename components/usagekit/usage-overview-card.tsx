"use client";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/usagekit/primitives/card";
import { UsageMark, UsageMeter } from "@/components/usagekit/usage-meter";
import type { UsageTone } from "@/components/usagekit/usage-motion";
import { UsageStatus, usageMotion } from "@/components/usagekit/usage-motion";
import type { UsageProgress } from "@/components/usagekit/usage-progress";
import { severerLevel, usageProgress } from "@/components/usagekit/usage-progress";
import type { ReactNode } from "react";
import { Children } from "react";

export const usageOverviewCardLabels = {
  unknown: "Usage unknown",
  empty: "No connections yet.",
  ok: "Within budget",
  warning: "Near limit",
  exceeded: "Over limit",
  partial: "Still measuring",
  loading: "Loading usage.",
};
export type UsageOverviewCardLabels = typeof usageOverviewCardLabels;
export type UsageOverviewCardProps = {
  title: string;
  description?: string;
  period?: string;
  id?: string;
  className?: string;
  action?: ReactNode;
  introduction?: ReactNode;
  notice?: { message: string; action?: ReactNode };
  budget: {
    label: string;
    /** Complete localized reading; announced by the meter and shown when no figure is given. */
    value: string;
    /** Short display figure such as "28%" or "At least 62%". */
    figure?: string;
    /** Small words before the figure, such as "At least" for a partial reading. */
    qualifier?: string;
    /** Context under the figure, such as the tightest connection. */
    caption?: string;
    /** Status words; defaults to the level labels. */
    status?: string;
    explanation?: string;
    percent: number | null;
    partial: boolean;
    meterLabel?: string;
    /** Percent where the warning level starts; omit to hide the mark. */
    warningAt?: number | null;
    /** Severity the host knows beyond the percent, such as reserved usage; the severer level shows. */
    level?: UsageProgress["level"];
  };
  metrics: readonly { id: string; label: string; value: string }[];
  /** Connection list items supplied by the host, usually UsageConnectionRow. */
  children?: ReactNode;
  empty?: string;
  emptyAction?: ReactNode;
  /** Initial read in progress: placeholders keep the layout instead of empty figures. */
  loading?: boolean;
  /** Headline figure size: "lg" leads a page, "md" and "sm" suit denser hosts. */
  size?: "sm" | "md" | "lg";
  labels?: Partial<UsageOverviewCardLabels>;
};

const figureSize = {
  sm: "text-2xl tracking-tight",
  md: "text-3xl leading-none tracking-tight",
  lg: "text-4xl leading-none tracking-tighter @xl:text-5xl",
};

const placeholder = "rounded bg-fg/[0.07] block animate-pulse motion-reduce:animate-none";

/** Shared usage framing; accounting, localized values and authority stay with the host. */
export function UsageOverviewCard({
  title,
  description,
  period,
  id,
  className,
  action,
  introduction,
  notice,
  budget,
  metrics,
  children,
  empty,
  emptyAction,
  loading = false,
  size = "lg",
  labels: custom,
}: UsageOverviewCardProps) {
  const labels = { ...usageOverviewCardLabels, ...custom };
  const progress = usageProgress(budget.percent, budget.partial);
  const level = severerLevel(progress.level, budget.level);
  const unknown = progress.kind === "unknown";
  // A partial reading below the warning point cannot confirm that usage is within budget.
  const settling = progress.kind === "partial" && level === "ok";
  const tone: UsageTone = unknown
    ? "unknown"
    : progress.kind === "none" || settling
      ? "neutral"
      : level === "ok"
        ? "positive"
        : level;
  const status =
    budget.status ??
    (unknown || progress.kind === "none" ? null : settling ? labels.partial : labels[level]);
  const figure = unknown ? labels.unknown : (budget.figure ?? budget.value);
  const hasConnections = Children.toArray(children).length > 0;
  const emptyText = empty ?? labels.empty;
  return (
    <Card
      id={id}
      data-usagekit="usage-overview-card"
      data-level={progress.kind === "none" || unknown ? progress.kind : level}
      aria-busy={loading || undefined}
      className={`min-h-0 w-full min-w-0 overflow-hidden ${className ?? ""}`}
    >
      <CardHeader>
        <div className="flex min-w-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-48 flex-1 space-y-1">
            <CardTitle role="heading" aria-level={2} className="break-words">
              {title}
            </CardTitle>
            {description && (
              <CardDescription className="max-w-prose">{description}</CardDescription>
            )}
            {period && <p className="text-xs/relaxed text-fg-muted tabular-nums">{period}</p>}
          </div>
          {action && <div className="flex max-w-full flex-wrap items-center gap-2">{action}</div>}
        </div>
      </CardHeader>
      <CardContent className="gap-6 flex min-w-0 flex-col">
        {notice && (
          <div
            role="alert"
            className={`rounded-lg border px-3.5 py-3 text-sm flex min-w-0 flex-wrap items-start gap-x-[0.75em] gap-y-1 border-red/30 bg-red/5 ${usageMotion.enter}`}
          >
            <svg
              aria-hidden
              viewBox="0 0 16 16"
              className="mt-[0.15em] size-[1.15em] shrink-0 text-red-text"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M8 1.75 14.75 13.5H1.25L8 1.75Z" />
              <path d="M8 6.25v3M8 11.5v.01" />
            </svg>
            <span className="min-w-0 flex-1 basis-48 break-words font-semibold leading-snug">
              {notice.message}
            </span>
            {notice.action && <span className="shrink-0 leading-snug">{notice.action}</span>}
          </div>
        )}
        {loading ? (
          <div role="status" className="@container min-w-0">
            <span className="sr-only">{labels.loading}</span>
            <div
              aria-hidden
              className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] @4xl:gap-10"
            >
              <span className="block min-w-0">
                <span className={`${placeholder} h-4 w-24`} />
                <span className={`${placeholder} mt-3 h-10 w-32`} />
                <span className={`${placeholder} mt-3 h-4 w-56 max-w-full`} />
                <span className="rounded-full bg-meter-track h-2.5 mt-5 block w-full animate-pulse motion-reduce:animate-none" />
              </span>
              <span className="grid min-w-0 grid-cols-2 content-start gap-x-6 gap-y-5 border-t border-border pt-5 @xl:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] @4xl:grid-cols-1 @4xl:gap-y-4 @4xl:border-t-0 @4xl:border-l @4xl:pt-0 @4xl:pl-8">
                {[0, 1, 2].map((key) => (
                  <span key={key} className="block">
                    <span className={`${placeholder} h-3 w-20`} />
                    <span className={`${placeholder} mt-2 h-5 w-24`} />
                  </span>
                ))}
              </span>
            </div>
          </div>
        ) : (
          <div className="@container min-w-0">
            <div className="grid min-w-0 gap-6 @4xl:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)] @4xl:gap-10">
              <section aria-label={budget.label} className="min-w-0">
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
                  <span className="text-sm text-fg-muted">{budget.label}</span>
                  {status && (
                    <UsageStatus key={status} tone={tone} className={usageMotion.enter}>
                      {status}
                    </UsageStatus>
                  )}
                </div>
                <p
                  key={`${budget.qualifier ?? ""}${figure}`}
                  className={`mt-2 flex min-w-0 flex-wrap items-baseline gap-x-2 ${usageMotion.enter}`}
                >
                  {budget.qualifier && !unknown && (
                    <span className="text-sm font-medium text-fg-muted">{budget.qualifier} </span>
                  )}
                  <span
                    className={`min-w-0 break-words font-semibold tabular-nums ${unknown ? "text-2xl tracking-tight text-fg-muted" : budget.figure ? figureSize[size] : "text-2xl tracking-tight"} ${level === "exceeded" && !unknown ? "text-red-text" : ""}`}
                  >
                    {figure}
                  </span>
                </p>
                {budget.caption && !unknown && (
                  <p className="text-sm mt-2 min-w-0 break-words text-fg-muted">{budget.caption}</p>
                )}
                {progress.kind !== "none" && (
                  <UsageMeter
                    size="lg"
                    percent={budget.percent}
                    partial={budget.partial}
                    level={budget.level}
                    label={budget.meterLabel ?? budget.label}
                    valueText={budget.value}
                    className="mt-5"
                    marks={
                      budget.warningAt !== undefined && budget.warningAt !== null ? (
                        <UsageMark at={`${budget.warningAt}%`} />
                      ) : null
                    }
                  />
                )}
                {budget.explanation && (
                  <p className="text-xs/relaxed mt-3 max-w-prose text-fg-muted">
                    {budget.explanation}
                  </p>
                )}
              </section>
              {metrics.length > 0 && (
                <dl className="grid min-w-0 grid-cols-2 content-start gap-x-6 gap-y-5 border-t border-border pt-5 @xl:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] @4xl:grid-cols-1 @4xl:gap-y-4 @4xl:border-t-0 @4xl:border-l @4xl:pt-0 @4xl:pl-8">
                  {metrics.map((metric, index) => (
                    <div key={metric.id} className="min-w-0 space-y-1">
                      <dt className="text-xs text-fg-muted">{metric.label}</dt>
                      <dd
                        key={metric.value}
                        className={`break-words font-semibold tabular-nums ${index === 0 ? "text-lg leading-snug" : "text-base leading-snug"} ${usageMotion.enter}`}
                      >
                        {metric.value}
                      </dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          </div>
        )}
        {hasConnections ? (
          <ul className="m-0 min-w-0 list-none divide-y divide-border border-t border-border p-0">
            {children}
          </ul>
        ) : (
          (emptyText || emptyAction) &&
          !loading && (
            <div className="rounded-lg border border-dashed px-4 py-3.5 flex min-w-0 flex-wrap items-center justify-between gap-3 border-border">
              {emptyText && <p className="text-sm min-w-0 text-fg-muted">{emptyText}</p>}
              {emptyAction}
            </div>
          )
        )}
        {introduction && (
          <div className="min-w-0 space-y-2 border-t border-border pt-5">{introduction}</div>
        )}
      </CardContent>
    </Card>
  );
}
