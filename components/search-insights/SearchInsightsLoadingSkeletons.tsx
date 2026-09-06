import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";
import { moduleTableColumns, moduleTablesLayout } from "./search-insights-table-columns";

// The bars carry their own classes literally, because a shared helper would hide the shape
// they stand in for. The row geometry is the exception: it has to be the table's own, or the
// space the skeleton reserves is not the space the rows arrive into.
const BAR = "animate-pulse rounded-control bg-bg-sunken";

// Six rows is what the design reserves: enough that the card keeps its height while the
// aggregate query resolves, few enough that it never reads as content.
const SKELETON_ROWS = [0, 1, 2, 3, 4, 5];
const SKELETON_CARDS = [0, 1, 2, 3];

export function SearchInsightsContextLoading() {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2.5 px-3 py-2.5">
        <div className={cn(BAR, "h-8 w-72 max-w-full")} />
        <div className={cn(BAR, "h-8 w-56 max-w-full")} />
        <div className={cn(BAR, "h-8 w-40 lg:ml-auto")} />
        <div className={cn(BAR, "h-8 w-28")} />
      </div>
    </section>
  );
}

export function SearchInsightsTrustStripLoading() {
  return (
    <div
      aria-hidden
      className="grid grid-cols-1 border-t border-border bg-bg-sunken xl:grid-cols-3"
    >
      {[0, 1, 2].map((cell) => (
        <div
          className={cn(
            "flex flex-col gap-2 px-4 py-3",
            cell > 0 && "border-t border-border xl:border-l xl:border-t-0",
          )}
          key={cell}
        >
          <div className={cn(BAR, "h-2.5 w-20")} />
          <div className={cn(BAR, "h-3.5 w-56 max-w-full")} />
          <div className={cn(BAR, "mt-auto h-2.5 w-64 max-w-full")} />
        </div>
      ))}
    </div>
  );
}

function TableCardLoading() {
  return (
    <section className="overflow-hidden rounded-card border border-border bg-bg-elev">
      <div className="flex items-baseline justify-between gap-2.5 px-4 pb-3 pt-3.5">
        <div className="flex flex-col gap-1.5">
          <div className={cn(BAR, "h-3.5 w-28")} />
          <div className={cn(BAR, "h-2.5 w-44")} />
        </div>
        <div className={cn(BAR, "h-2.5 w-16")} />
      </div>
      {/* The same wrapper the real table gets: below the width the columns need, the rows scroll
          instead of squeezing the fluid text column away. */}
      <div className="flex flex-col overflow-x-auto border-t border-border">
        {SKELETON_ROWS.map((row) => (
          <div
            className={cn(
              "grid items-center gap-2.5 border-b border-border px-4 py-3 last:border-b-0",
              moduleTableColumns.queries,
            )}
            key={row}
          >
            <div className={cn(BAR, "h-2.75")} />
            <div className={cn(BAR, "h-2.75")} />
            <div className={cn(BAR, "h-2.75")} />
            <div className={cn(BAR, "h-2.75")} />
            <div className={cn(BAR, "h-2.75")} />
            <div className={cn(BAR, "h-2.75")} />
          </div>
        ))}
      </div>
    </section>
  );
}

export function SearchInsightsBodyLoading() {
  return (
    <section
      aria-busy="true"
      aria-label="Search Console data loading"
      className="flex flex-col gap-2.5"
    >
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        {SKELETON_CARDS.map((card) => (
          <div
            className="flex min-w-0 flex-col gap-2 rounded-card border border-border bg-bg-elev px-4 pb-4 pt-3.5"
            key={card}
          >
            <div className={cn(BAR, "h-2.5 w-24")} />
            <div className={cn(BAR, "h-6 w-20")} />
            <div className={cn(BAR, "h-2.5 w-16")} />
          </div>
        ))}
      </div>
      <div className="grid grid-cols-1 gap-2.5 md:grid-cols-2">
        {[0, 1].map((chip) => (
          <div
            className="flex items-center gap-3 rounded-card border border-border bg-bg-elev px-4 py-3"
            key={chip}
          >
            <div className={cn(BAR, "h-9.5 w-9.5 shrink-0")} />
            <div className="flex min-w-0 flex-1 flex-col gap-1.5">
              <div className={cn(BAR, "h-3.5 w-48 max-w-full")} />
              <div className={cn(BAR, "h-2.5 w-64 max-w-full")} />
            </div>
          </div>
        ))}
      </div>
      {/* The layout the cards arrive into, so the space this reserves is the space they take. */}
      <div className={moduleTablesLayout}>
        <TableCardLoading />
        <TableCardLoading />
      </div>
    </section>
  );
}

export function SearchInsightsPageLoading() {
  return (
    <PageContent>
      <section
        aria-busy="true"
        aria-label="Search Console page loading"
        className="flex min-w-0 flex-col gap-3"
      >
        <SearchInsightsContextLoading />
        <SearchInsightsBodyLoading />
      </section>
    </PageContent>
  );
}
