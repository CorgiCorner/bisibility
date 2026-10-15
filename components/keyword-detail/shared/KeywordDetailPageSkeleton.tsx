import { Card } from "@/components/ui/Card";
import type { ReactNode } from "react";

const slots = ["position", "ranking-url", "last-check"] as const;
const rows = ["first", "second", "third", "fourth"] as const;

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-control bg-bg-sunken ${className}`}
      data-keyword-detail-skeleton-bar
    />
  );
}
function Panel({ children, className }: Readonly<{ children: ReactNode; className?: string }>) {
  return (
    <Card size="lg" className={`min-w-0 ${className ?? ""}`}>
      {children}
    </Card>
  );
}

/** Follows the current route: backlink, one header, recorded history, stored SERP, comparison, traffic. */
export function KeywordDetailPageSkeleton({ ariaLabel }: Readonly<{ ariaLabel: string }>) {
  return (
    <section aria-busy="true" aria-label={ariaLabel} className="grid min-w-0 gap-4">
      <Bar className="h-5 w-32" />
      <Panel>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 flex-wrap items-center gap-2.5">
            <Bar className="h-7 w-48 max-w-full" />
            <Bar className="h-6 w-24" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Bar className="h-8.5 w-36" />
            <Bar className="h-8.5 w-8.5" />
            <Bar className="h-8.5 w-8.5" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-[7px]" data-keyword-detail-skeleton-context-pills>
          {["market", "device", "language", "engine"].map((key) => (
            <Bar className="h-7 w-24" key={key} />
          ))}
        </div>
        <div
          className="mt-4 grid grid-cols-1 gap-x-6 gap-y-4 border-t border-border pt-4 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)]"
          data-keyword-detail-skeleton-slots
        >
          {slots.map((key) => (
            <div className="min-w-0" key={key}>
              <Bar className="h-3 w-20" />
              <Bar className="mt-2 h-6 w-32 max-w-full" />
              <Bar className="mt-2 h-4 w-40 max-w-full" />
            </div>
          ))}
          <div className="border-t border-border pt-3 sm:col-span-2 lg:col-span-3">
            <Bar className="h-3 w-28" />
            <Bar className="mt-1.5 h-6 w-40" />
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap gap-x-6 gap-y-2 border-t border-border pt-3"
          data-keyword-detail-skeleton-header-metadata
        >
          {["label", "volume", "difficulty", "cpc", "market"].map((key) => (
            <Bar className="h-5 w-24" key={key} />
          ))}
        </div>
      </Panel>
      <Panel>
        <div className="ml-10 mr-4 flex flex-wrap items-start justify-between gap-4">
          <div>
            <Bar className="h-5 w-36" />
            <Bar className="mt-2 h-4 w-40" />
          </div>
          <Bar className="h-8.5 w-56 max-w-full" />
        </div>
        <Bar className="mt-2 h-[280px] w-full" />
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border py-3">
          <Bar className="h-7 w-48" />
          <Bar className="h-4 w-56 max-w-full" />
        </div>
        {rows.map((key) => (
          <div
            className="flex min-h-11 items-center gap-4 border-b border-border py-2"
            data-keyword-detail-skeleton-ranking-history-row
            key={key}
          >
            <Bar className="h-3 w-24" />
            <Bar className="h-3 min-w-0 flex-1" />
            <Bar className="h-3 w-16" />
          </div>
        ))}
      </Panel>
      <Panel className="overflow-hidden p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 p-5">
          <Bar className="h-5 w-40" />
          <Bar className="h-8.5 w-36" />
        </div>
        <Bar className="h-[480px] w-full rounded-none sm:h-[520px]" />
      </Panel>
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Bar className="h-5 w-40" />
          <Bar className="h-8.5 w-36" />
        </div>
      </Panel>
      <Panel>
        <Bar className="h-5 w-36" />
        <Bar className="mt-3 h-4 w-64 max-w-full" />
        <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
          {["clicks", "impressions", "ctr", "position"].map((key) => (
            <Bar className="h-14 w-full" key={key} />
          ))}
        </div>
      </Panel>
    </section>
  );
}
