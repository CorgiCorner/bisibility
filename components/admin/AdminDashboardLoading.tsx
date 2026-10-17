import { Card } from "@/components/ui/Card";
import type { ReactNode } from "react";

function Bar({ className = "w-24" }: { className?: string }) {
  return <span className={`block h-3 max-w-full rounded bg-border ${className}`} />;
}

function Metrics({ count, columns }: { count: number; columns: string }) {
  return (
    <div className={`grid gap-3 ${columns}`}>
      {Array.from({ length: count }, (_, index) => (
        <div className="min-w-0 rounded-card border border-border bg-bg-sunken p-3" key={index}>
          <Bar />
          <Bar className="mt-2 h-7 w-16" />
        </div>
      ))}
    </div>
  );
}

function Panel({ children }: { children: ReactNode }) {
  return (
    <Card className="min-w-0" size="lg">
      <Bar className="h-5 w-40" />
      <Bar className="mt-1 h-5 w-96" />
      <div className="mt-4">{children}</div>
    </Card>
  );
}

export function AdminDashboardLoading() {
  return (
    <div
      aria-hidden="true"
      aria-busy="true"
      className="flex w-full min-w-0 flex-col gap-5 motion-safe:animate-pulse"
      data-admin-dashboard-loading
    >
      <div className="flex flex-wrap gap-2">
        {[0, 1, 2, 3].map((i) => (
          <Bar className="h-7 w-28 rounded-full" key={i} />
        ))}
      </div>
      <Panel>
        <Metrics count={9} columns="sm:grid-cols-2 xl:grid-cols-4" />
      </Panel>
      <Panel>
        {[0, 1].map((i) => (
          <div className={i ? "mt-5" : ""} key={i}>
            <Bar className="mb-3 h-5 w-32" />
            <Metrics count={7} columns="grid-cols-2 sm:grid-cols-4 xl:grid-cols-7" />
          </div>
        ))}
        <div className="mt-5 space-y-4">
          {[0, 1].map((i) => (
            <div key={i}>
              <Bar className="h-5 w-36" />
              <Bar className="mt-2 h-5 w-96" />
              <Bar className="mt-3 h-5 w-64" />
            </div>
          ))}
        </div>
      </Panel>
      <Panel>
        <Bar className="h-24 w-full" />
      </Panel>
      <Panel>
        <Metrics count={3} columns="sm:grid-cols-3" />
      </Panel>
      <Panel>
        <Bar className="mb-3 h-5 w-32" />
        <Metrics count={6} columns="grid-cols-2 md:grid-cols-3 xl:grid-cols-6" />
        <Bar className="mt-5 h-5 w-40" />
        <Bar className="mt-1 h-5 w-96" />
        <Bar className="mt-3 h-5 w-72" />
      </Panel>
      <Panel>
        <Bar className="h-[34px] w-40 rounded-control" />
        <Bar className="mt-3 h-20 w-full" />
      </Panel>
      <Panel>
        <Metrics count={5} columns="grid-cols-2 sm:grid-cols-3 xl:grid-cols-5" />
        <Bar className="mt-4 h-32 w-full" />
      </Panel>
    </div>
  );
}
