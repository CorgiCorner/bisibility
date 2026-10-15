import { PageContent } from "@/components/shell/PageContent";
import {
  dataTableHeaderHeight,
  dataTableRowHeight,
} from "@/components/ui/data-table/data-table-density";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className: string }>) {
  return (
    <span
      className={cn(
        "block max-w-full rounded-control bg-bg-sunken motion-safe:animate-pulse",
        className,
      )}
    />
  );
}
export function RunDetailLoading() {
  return (
    <PageContent aria-busy="true" aria-hidden>
      <div className="grid min-w-0 gap-4" data-run-detail-loading="">
        <Bar className="h-[19px] w-24" />
        <section className="min-w-0 rounded-card border border-border bg-bg-elev">
          <header className="space-y-1.5 border-b border-border p-4">
            <Bar className="h-[22px] w-56" />
            <Bar className="h-6 w-72" />
          </header>
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {["one", "two", "three", "four"].map((key) => (
              <div className="space-y-1" key={key}>
                <Bar className="h-[15px] w-20" />
                <Bar className="h-[18px] w-32" />
                <Bar className="h-4 w-36" />
              </div>
            ))}
          </div>
        </section>
        <section className="space-y-3 rounded-card border border-border bg-bg-elev p-4">
          <Bar className="h-[18px] w-56" />
          <Bar className="h-1.5 w-full" />
          <Bar className="h-4 w-20" />
          <div className="grid grid-cols-2 gap-x-6 gap-y-[18px] sm:grid-cols-4">
            {["one", "two", "three", "four"].map((key) => (
              <div className="space-y-1" key={key}>
                <Bar className="h-4 w-16" />
                <Bar className="h-5 w-12" />
                <Bar className="h-[15px] w-24" />
              </div>
            ))}
          </div>
        </section>
        <section className="min-w-0 overflow-hidden rounded-card border border-border bg-bg-elev">
          <header className="flex flex-wrap items-center justify-between gap-3 px-4 py-3.5">
            <div className="space-y-1">
              <Bar className="h-5 w-28" />
              <Bar className="h-[14.5px] w-24" />
            </div>
            <Bar className="h-8 w-52" />
          </header>
          <div className="overflow-x-auto">
            <div
              className="min-w-[760px] border-y border-border bg-table-header-bg"
              style={{ height: dataTableHeaderHeight }}
            />
            {["one", "two", "three"].map((key) => (
              <div
                key={key}
                className="flex min-w-[760px] items-center gap-6 border-b border-border-soft px-3"
                style={{ height: dataTableRowHeight("compact") }}
              >
                <Bar className="h-4 w-48" />
                <Bar className="h-4 w-24" />
                <Bar className="h-4 w-16" />
                <Bar className="h-4 w-32" />
              </div>
            ))}
          </div>
          <footer className="px-4 py-3">
            <Bar className="h-[17px] w-24" />
          </footer>
        </section>
      </div>
    </PageContent>
  );
}
