"use client";

import { formatCap } from "@/components/checks/upcoming/upcoming-format";
import { useDateFormat } from "@/components/dates/DateFormatProvider";
import { Button } from "@/components/ui/Button";
import type { CheckRunsView, UpcomingView } from "@/lib/checks/contract";
import { zonedDateInputValue } from "@/lib/checks/date-boundary";
import { type DateFormat, formatDateRange } from "@/lib/dates/format";
import { ArrowClockwiseIcon as Retry } from "@phosphor-icons/react/dist/ssr/ArrowClockwise";
import { ArrowRightIcon as ArrowRight } from "@phosphor-icons/react/dist/ssr/ArrowRight";
import { ClockCountdownIcon as Clock } from "@phosphor-icons/react/dist/ssr/ClockCountdown";
import { PauseCircleIcon as Pause } from "@phosphor-icons/react/dist/ssr/PauseCircle";
import { WarningCircleIcon as Warning } from "@phosphor-icons/react/dist/ssr/WarningCircle";
import Link from "next/link";
import type { ReactNode } from "react";

export type CheckRunsBudget = Pick<UpcomingView, "blocked" | "forecast">;

type StatusBandsProps = {
  budget: CheckRunsBudget;
  budgetSettingsHref: string;
  now: Date;
  onRetryFailed?: () => void;
  onRetryStale?: () => void;
  showStale?: boolean;
  timeZone: string;
  view: CheckRunsView;
};

function nextMonthLabel(now: Date, timeZone: string, dateFormat: DateFormat) {
  const [year, month] = zonedDateInputValue(now, timeZone).split("-").map(Number);
  const nextMonth = new Date(Date.UTC(year, month, 1, 12));
  const key = nextMonth.toISOString().slice(0, 10);
  return formatDateRange(key, key, dateFormat);
}

function budgetStatus(budget: CheckRunsBudget, view: CheckRunsView) {
  const blocked = budget.blocked.find((group) => group.reason === "budget_exhausted");
  const skipped = view.deferredGroups.find((group) => group.reason === "budget_exhausted")?.count;
  if (
    blocked ||
    (budget.forecast &&
      budget.forecast.capCents > 0 &&
      budget.forecast.spentCents >= budget.forecast.capCents)
  ) {
    return { kind: "exhausted" as const, skipped: skipped ?? blocked?.keywordCount ?? 0 };
  }
  if (!budget.forecast || budget.forecast.capCents <= 0) return null;
  const projected = budget.forecast.spentCents + budget.forecast.next48hCents;
  const percent = Math.round((projected / budget.forecast.capCents) * 100);
  return percent >= 80 ? { kind: "warning" as const, percent } : null;
}

function Band({
  action,
  children,
  icon,
  tone,
}: Readonly<{
  action: ReactNode;
  children: ReactNode;
  icon: ReactNode;
  tone: "aged" | "red" | "yellow";
}>) {
  const classes = {
    aged: "border-dashed border-border bg-bg-sunken",
    red: "border-red/35 bg-red/8",
    yellow: "border-yellow/35 bg-yellow/10",
  }[tone];
  return (
    <div
      className={`mx-4 mt-3 flex flex-wrap items-start gap-2.5 rounded-control border px-3.5 py-3 ${classes}`}
    >
      {icon}
      <p className="m-0 min-w-[200px] flex-1 text-[12.5px] leading-[1.55] text-fg">{children}</p>
      {action}
    </div>
  );
}

function RetryButton({ label, onClick }: Readonly<{ label: string; onClick: () => void }>) {
  return (
    <Button
      onClick={onClick}
      size="sm"
      startIcon={<Retry aria-hidden size={12} weight="regular" />}
      variant="secondary"
    >
      {label}
    </Button>
  );
}

export function CheckRunsStatusBands({
  budget,
  budgetSettingsHref,
  now,
  onRetryFailed,
  onRetryStale,
  showStale = true,
  timeZone,
  view,
}: Readonly<StatusBandsProps>) {
  const dateFormat = useDateFormat();
  const budgetState = budgetStatus(budget, view);
  if (budgetState?.kind === "exhausted") {
    const checkLabel = budgetState.skipped === 1 ? "check was" : "checks were";
    return (
      <Band
        action={
          <Button
            component={Link}
            endIcon={<ArrowRight aria-hidden size={11} weight="regular" />}
            href={budgetSettingsHref}
            size="sm"
            variant="ghost"
          >
            Change limit
          </Button>
        }
        icon={
          <Pause
            aria-hidden
            className="mt-0.5 shrink-0 text-yellow-text"
            size={15}
            weight="regular"
          />
        }
        tone="yellow"
      >
        Monthly spending limit reached.{" "}
        {budgetState.skipped > 0 ? (
          <>
            {budgetState.skipped.toLocaleString("en-US")} {checkLabel} skipped - checks
          </>
        ) : (
          "Checks"
        )}{" "}
        resume on {nextMonthLabel(now, timeZone, dateFormat)}.
      </Band>
    );
  }
  if (budgetState?.kind === "warning" && budget.forecast) {
    return (
      <Band
        action={
          <Button component={Link} href={budgetSettingsHref} size="sm" variant="ghost">
            Review limit
          </Button>
        }
        icon={
          <Pause
            aria-hidden
            className="mt-0.5 shrink-0 text-yellow-text"
            size={15}
            weight="regular"
          />
        }
        tone="yellow"
      >
        Estimated spend is at {budgetState.percent}% of the {formatCap(budget.forecast.capCents)}
        /month limit.
      </Band>
    );
  }
  const stale = showStale ? view.staleCount : 0;
  if (stale > 0) {
    const checkLabel = stale === 1 ? "check" : "checks";
    return (
      <Band
        action={onRetryStale ? <RetryButton label="Retry stale" onClick={onRetryStale} /> : null}
        icon={
          <Clock aria-hidden className="mt-0.5 shrink-0 text-fg-muted" size={15} weight="regular" />
        }
        tone="aged"
      >
        Positions shown may be stale. {stale.toLocaleString("en-US")} {checkLabel} last completed
        more than 48 hours ago.
      </Band>
    );
  }
  if (view.counts.failed > 0) {
    const total = view.counts.completed + view.counts.failed + view.counts.deferred;
    return (
      <Band
        action={onRetryFailed ? <RetryButton label="Retry failed" onClick={onRetryFailed} /> : null}
        icon={
          <Warning
            aria-hidden
            className="mt-0.5 shrink-0 text-red-text"
            size={15}
            weight="regular"
          />
        }
        tone="red"
      >
        {view.counts.failed.toLocaleString("en-US")} of {total.toLocaleString("en-US")} checks
        failed. Successful checks in the same run kept their results.
      </Band>
    );
  }
  return null;
}
