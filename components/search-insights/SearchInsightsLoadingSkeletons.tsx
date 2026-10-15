"use client";

import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";
import { SearchInsightsSignalChips } from "./SearchInsightsSignalChips";
import { SearchInsightsTableLoading } from "./SearchInsightsTableLoading";
import { moduleTablesLayout } from "./search-insights-table-columns";

const BAR = "animate-pulse rounded-control bg-bg-sunken";

const SKELETON_CARDS = [0, 1, 2, 3];

export function SearchInsightsContextLoading() {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
        <div className={cn(BAR, "h-[34px] w-72 max-w-full")} />
        <div className={cn(BAR, "h-[34px] w-48 max-w-full")} />
        <div className={cn(BAR, "h-[34px] w-60 max-w-full")} />
        <div className={cn(BAR, "h-[34px] w-48 lg:ml-auto")} />
        <div className={cn(BAR, "h-[34px] w-24")} />
        <div className={cn(BAR, "h-[34px] w-28")} />
      </div>
      <SearchInsightsTrustStripLoading />
    </section>
  );
}

export function SearchInsightsTrustStripLoading() {
  return (
    <div aria-hidden className="grid grid-cols-1 border-t border-border bg-bg-elev xl:grid-cols-3">
      {[0, 1, 2].map((cell) => (
        <div
          className={cn(
            "flex flex-col gap-1.5 px-4 py-3",
            cell > 0 && "border-t border-border xl:border-l xl:border-t-0",
          )}
          key={cell}
        >
          <div className={cn(BAR, "h-[1lh] w-20 text-ui-micro")} />
          <div className={cn(BAR, "h-[1lh] w-56 max-w-full text-ui-body")} />
          <div className="mt-auto pt-2 text-ui-caption">
            <div className={cn(BAR, "w-64 max-w-full", cell === 1 ? "h-[2lh]" : "h-[1lh]")} />
          </div>
          {cell === 0 ? (
            <div className="pt-2 text-ui-caption">
              <div className={cn(BAR, "h-[1lh] w-48 max-w-full")} />
            </div>
          ) : null}
        </div>
      ))}
      <div className="col-span-full border-t border-border px-4 py-2.5">
        <div className="flex items-center justify-between gap-3 pt-2 text-ui-caption">
          <div className="grid">
            <div className={cn(BAR, "h-[1lh] w-24 text-[12px]")} />
            <div className={cn(BAR, "h-[1lh] w-40 text-[11px]")} />
          </div>
          <div className={cn(BAR, "h-7 w-24")} />
        </div>
      </div>
    </div>
  );
}

export function SearchInsightsBodyLoading({ ariaLabel }: Readonly<{ ariaLabel: string }>) {
  return (
    <section aria-busy="true" aria-label={ariaLabel} className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {SKELETON_CARDS.map((card) => (
          <div
            className="flex min-w-0 flex-col gap-1.5 rounded-card border border-border bg-bg-elev px-4 pb-4 pt-3.5"
            key={card}
          >
            <div className="flex items-center gap-2">
              <div className={cn(BAR, "h-[1lh] w-24 text-ui-micro")} />
              <div className={cn(BAR, "h-[calc(1lh+2px)] w-8 rounded-full text-ui-micro")} />
            </div>
            <div className={cn(BAR, "h-[1lh] w-20 text-ui-h1")} />
            <div className={cn(BAR, "h-[1lh] w-16 text-ui-caption")} />
            <div className={cn(BAR, "h-[1lh] w-24 text-ui-micro")} />
          </div>
        ))}
      </div>
      <SearchInsightsSignalChips namedQueryCount={0} state="pending" />
      {/* The layout the cards arrive into, so the space this reserves is the space they take. */}
      <div className={moduleTablesLayout}>
        <SearchInsightsTableLoading />
        <SearchInsightsTableLoading pages />
      </div>
    </section>
  );
}

export function SearchInsightsPageLoading({
  bodyAriaLabel,
  pageAriaLabel,
}: Readonly<{ bodyAriaLabel: string; pageAriaLabel: string }>) {
  return (
    <PageContent>
      <section aria-busy="true" aria-label={pageAriaLabel} className="flex min-w-0 flex-col gap-3">
        <SearchInsightsContextLoading />
        <SearchInsightsBodyLoading ariaLabel={bodyAriaLabel} />
      </section>
    </PageContent>
  );
}
