"use client";

import type { SearchInsightsKpi } from "@/lib/search-insights/queries/kpis-model";
import type { OrganicSessionsPendingPresentation } from "@/lib/search-insights/queries/sessions-context";
import { cn } from "@/lib/ui/cn";
import {
  ArrowDownRightIcon as ArrowDownRight,
  ArrowUpRightIcon as ArrowUpRight,
} from "@phosphor-icons/react";

export type SearchInsightsKpiRowProps = {
  /** Optional fifth card, so a second source can join the row without a second layout. */
  extra?: SearchInsightsKpi | OrganicSessionsPendingPresentation | null;
  kpis: readonly SearchInsightsKpi[];
};

// A flat window gets no arrow: pointing one anywhere would assert a direction the word denies.
const DELTA_ARROW = { down: ArrowDownRight, flat: null, up: ArrowUpRight } as const;

function KpiCard({ kpi }: Readonly<{ kpi: SearchInsightsKpi }>) {
  const up = kpi.dir === "up";
  const Arrow = DELTA_ARROW[kpi.dir];
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-bg-elev px-4 pb-4 pt-3.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-ui-micro uppercase tracking-wide text-fg-muted">
          {kpi.label}
        </span>
        {/* Which system produced the number, on the number itself: two sources share this row. */}
        <span className="shrink-0 rounded-full bg-bg-sunken px-1.5 py-px font-mono text-ui-micro tracking-wide text-fg-muted">
          {kpi.source}
        </span>
      </span>
      <span className="font-mono text-ui-h1">{kpi.value}</span>
      <span
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap font-mono text-ui-caption",
          // Improvement is the only thing that earns colour; everything else stays muted so a
          // normal week does not read as an alarm.
          up ? "text-green-text" : "text-fg-muted",
        )}
      >
        {Arrow ? <Arrow aria-hidden className="shrink-0" size={12} weight="regular" /> : null}
        {kpi.delta}
      </span>
      <span className="whitespace-nowrap font-mono text-ui-micro text-fg-muted">
        from {kpi.prev}
      </span>
    </div>
  );
}

function PendingKpiCard({ pending }: Readonly<{ pending: OrganicSessionsPendingPresentation }>) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-bg-elev px-4 pb-4 pt-3.5">
      <span className="flex min-w-0 items-center gap-2">
        <span className="min-w-0 truncate font-mono text-ui-micro uppercase tracking-wide text-fg-muted">
          {pending.label}
        </span>
        <span className="shrink-0 rounded-full bg-bg-sunken px-1.5 py-px font-mono text-ui-micro tracking-wide text-fg-muted">
          {pending.source}
        </span>
      </span>
      <span className="font-mono text-ui-h1">Pending</span>
      <span className="font-mono text-ui-caption text-fg-muted">{pending.status}</span>
      <span className="text-ui-micro text-fg-muted">{pending.reason}</span>
      {pending.readyIn ? (
        <span className="font-mono text-ui-micro text-fg-muted">Ready in {pending.readyIn}</span>
      ) : null}
    </div>
  );
}

export function SearchInsightsKpiRow({ extra, kpis }: Readonly<SearchInsightsKpiRowProps>) {
  const cards = extra ? [...kpis, extra] : [...kpis];
  return (
    <div
      className={cn(
        "grid grid-cols-2 gap-2.5",
        cards.length > 4 ? "lg:grid-cols-5" : "lg:grid-cols-4",
      )}
    >
      {cards.map((kpi) =>
        "kind" in kpi ? (
          <PendingKpiCard key={kpi.label} pending={kpi} />
        ) : (
          <KpiCard key={kpi.label} kpi={kpi} />
        ),
      )}
    </div>
  );
}
