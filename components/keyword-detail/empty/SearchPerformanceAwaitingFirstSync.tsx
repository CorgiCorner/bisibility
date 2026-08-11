import {
  EmptyModuleCard,
  EmptyModuleTitle,
} from "@/components/keyword-detail/empty/empty-state-primitives";
import type { ReactNode } from "react";

export type LandingPagePerformanceModuleProps = {
  dataSourceCount: number;
  children: ReactNode;
};

/** A single source cannot form a landing-page performance comparison. */
export function LandingPagePerformanceModule({
  children,
  dataSourceCount,
}: Readonly<LandingPagePerformanceModuleProps>) {
  if (dataSourceCount === 1) return null;
  return <>{children}</>;
}

export function SearchPerformanceAwaitingFirstSync() {
  return (
    <EmptyModuleCard>
      <div className="flex flex-wrap items-center gap-2">
        <EmptyModuleTitle>Search performance</EmptyModuleTitle>
        <span className="inline-flex h-6 items-center rounded-full border border-border bg-bg-sunken px-2.5 font-mono text-[10.5px] text-fg-muted">
          Search Console
        </span>
      </div>
      <p className="m-0 mt-1 text-[12px] text-fg-muted">Trailing 28 days</p>
      <div className="mt-4 rounded-[11px] border border-dashed border-border-strong bg-bg-sunken px-4 py-5">
        <p className="m-0 text-[13px] font-medium text-fg">Awaiting first traffic sync.</p>
        <p className="m-0 mt-2 text-[12px] leading-[1.5] text-fg-muted">
          Search Console data arrives with an approximately 3-day reporting lag.
        </p>
      </div>
    </EmptyModuleCard>
  );
}
