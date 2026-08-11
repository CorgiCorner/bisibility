import type { ReactNode } from "react";

const metricKeys = ["position", "ranking-url", "what-changed"] as const;
// This placeholder row count matches the four periods in the spec render, not a contract for
// real keyword data, which can have one period or many.
const rankingHistoryKeys = ["current", "previous", "first-seen", "earlier"] as const;

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <div
      aria-hidden
      className={`animate-pulse rounded-[8px] bg-bg-sunken ${className}`}
      data-keyword-detail-skeleton-bar
    />
  );
}

function Panel({ children, className }: Readonly<{ children: ReactNode; className: string }>) {
  return (
    <div className={`rounded-[14px] border border-border bg-bg-elev ${className}`}>{children}</div>
  );
}

function MetricCard() {
  return (
    <Panel className="flex h-[158px] flex-col p-4">
      <Bar className="h-2.5 w-20" />
      <Bar className="mt-3 h-7 w-24" />
      <Bar className="mt-2 h-3 w-16" />
      <Bar className="mt-auto h-3 w-[68%]" />
    </Panel>
  );
}

function ChartPanel() {
  return (
    <Panel className="h-[300px] p-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <Bar className="h-4 w-32" />
          <Bar className="mt-2 h-3 w-56" />
        </div>
        <Bar className="h-8 w-32" />
      </div>
      <Bar className="mt-4 h-[216px] w-full rounded-[10px]" />
    </Panel>
  );
}

function SearchPerformancePanel() {
  return (
    <Panel className="h-[172px] p-4">
      <Bar className="h-4 w-36" />
      <Bar className="mt-2 h-3 w-48" />
      <div className="mt-4 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {["clicks", "impressions", "ctr", "position"].map((key) => (
          <Bar className="h-[58px] w-full" key={key} />
        ))}
      </div>
      <Bar className="mt-3 h-3 w-[72%]" />
    </Panel>
  );
}

function LandingPagePanel() {
  return (
    <Panel className="h-[204px] p-4">
      <Bar className="h-4 w-44" />
      <Bar className="mt-2 h-3 w-64" />
      <div className="mt-4 rounded-[10px] border border-border p-3">
        <Bar className="h-4 w-32" />
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-5">
          {["sessions", "visitors", "bounce", "duration", "scroll"].map((key) => (
            <Bar className="h-[58px] w-full" key={key} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function RankingHistoryPanel() {
  return (
    <Panel className="h-[240px] overflow-hidden">
      <div className="flex items-center justify-between gap-4 border-b border-border px-4 py-3.5">
        <div>
          <Bar className="h-4 w-40" />
          <Bar className="mt-2 h-3 w-72" />
        </div>
        <Bar className="h-6 w-28 rounded-full" />
      </div>
      {rankingHistoryKeys.map((key) => (
        <div
          className="flex h-[44px] items-center gap-4 border-b border-border-soft px-4"
          data-keyword-detail-skeleton-ranking-history-row
          key={key}
        >
          <Bar className="h-2.5 w-2.5 rounded-full" />
          <Bar className="h-3 w-24" />
          <Bar className="h-3 flex-1" />
          <Bar className="h-3 w-16" />
        </div>
      ))}
    </Panel>
  );
}

export function KeywordDetailPageSkeleton() {
  return (
    <section aria-busy="true" aria-label="Loading keyword detail" className="grid min-w-0 gap-4">
      <Panel className="p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <Bar className="h-7 w-48" />
            <div
              className="mt-3 flex flex-wrap gap-[7px]"
              data-keyword-detail-skeleton-context-pills
            >
              <Bar className="h-7 w-28 rounded-full" />
              <Bar className="h-7 w-20 rounded-full" />
              <Bar className="h-7 w-16 rounded-full" />
              <Bar className="h-7 w-24 rounded-full" />
            </div>
          </div>
          <div className="flex gap-2">
            <Bar className="h-10 w-36" />
            <Bar className="h-10 w-10" />
            <Bar className="h-10 w-10" />
          </div>
        </div>
        <div
          className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1"
          data-keyword-detail-skeleton-header-metadata
        >
          <Bar className="h-3 w-28" />
          <Bar className="h-3 w-px" />
          <Bar className="h-3 w-32" />
          <Bar className="h-3 w-24" />
          <Bar className="h-3 w-20" />
        </div>
        <div className="mt-4 border-t border-border pt-3">
          <Bar className="h-6 w-56 rounded-full" />
        </div>
      </Panel>
      <div className="grid gap-3 lg:grid-cols-3">
        {metricKeys.map((key) => (
          <MetricCard key={key} />
        ))}
      </div>
      <div className="flex flex-wrap gap-[7px]">
        <Bar className="h-7 w-24 rounded-full" />
        <Bar className="h-7 w-20 rounded-full" />
        <Bar className="h-7 w-24 rounded-full" />
      </div>
      <ChartPanel />
      <SearchPerformancePanel />
      <LandingPagePanel />
      <RankingHistoryPanel />
    </section>
  );
}
