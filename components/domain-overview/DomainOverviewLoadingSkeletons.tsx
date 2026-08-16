import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";
import type { ComponentPropsWithoutRef } from "react";

const six = ["traffic", "keywords", "top10", "value", "pos1", "new"] as const;
const eight = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;

function Bar({ className, ...props }: Readonly<ComponentPropsWithoutRef<"div">>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} {...props} />;
}

function ContextLoading() {
  return (
    <div className="flex flex-wrap gap-2.5 rounded-[11px] border border-border bg-bg-elev p-3.5">
      <Bar className="h-7 w-[160px] rounded-full" />
      <Bar className="h-7 w-[190px] rounded-full" />
      <span className="basis-full" />
      <Bar className="h-3 w-[280px]" />
      <Bar className="ml-auto h-3 w-[112px]" />
    </div>
  );
}

function KpisLoading() {
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {six.map((key) => (
        <div className="rounded-[13px] border border-border bg-bg-elev px-[18px] py-4" key={key}>
          <Bar className="h-2.5 w-[96px] bg-border" />
          <Bar className="mt-[9px] h-7 w-[120px]" />
        </div>
      ))}
    </div>
  );
}

function ChartLoading() {
  return (
    <div className="grid gap-3 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <div className="rounded-[14px] border border-border bg-bg-elev p-4">
        <div className="flex flex-wrap items-center gap-2">
          <Bar className="h-4 w-[150px]" />
          <Bar className="ml-auto h-8 w-[86px]" />
          <Bar className="h-8 w-[86px]" />
        </div>
        <Bar className="mt-4 h-[260px] w-full" />
      </div>
      <div className="rounded-[14px] border border-border bg-bg-elev p-4">
        <Bar className="h-4 w-[120px]" />
        <div className="mt-5 grid grid-cols-2 gap-4 xl:grid-cols-1">
          {["72", "64", "58", "50"].map((width) => (
            <Bar className="h-3" key={width} style={{ width: `${width}%` }} />
          ))}
        </div>
      </div>
    </div>
  );
}

function TableLoading({ pages = false }: Readonly<{ pages?: boolean }>) {
  return (
    <div className="overflow-hidden rounded-[12px] border border-border bg-bg-elev">
      <div className="flex items-center gap-3 border-b border-border-strong px-4 py-3">
        <Bar className="h-4 w-[150px]" />
        <Bar className="ml-auto h-8 w-[84px]" />
      </div>
      <div className="overflow-x-auto">
        <div className={pages ? "min-w-[900px]" : "min-w-[1180px]"}>
          <div className="h-[42px] border-b border-border-strong bg-bg-sunken" />
          {eight.map((key, index) => (
            <div
              className="flex h-[58px] items-center gap-8 border-b border-border-soft px-4"
              key={key}
            >
              <Bar className={cn("h-3", index % 2 ? "w-[58%]" : "w-[72%]")} />
              <Bar className="ml-auto h-3 w-[86px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function DomainOverviewResultsLoading() {
  return (
    <div aria-busy="true" aria-label="Domain Overview loading" className="grid min-w-0 gap-[18px]">
      <ContextLoading />
      <KpisLoading />
      <ChartLoading />
      <div className="rounded-[14px] border border-border bg-bg-elev p-4">
        <Bar className="h-4 w-[210px]" />
        <div className="mt-4 grid gap-3">
          {six.map((key, index) => (
            <Bar className="h-3" key={key} style={{ width: `${30 + index * 10}%` }} />
          ))}
        </div>
      </div>
      <TableLoading />
      <TableLoading pages />
    </div>
  );
}

export function DomainOverviewPageLoading() {
  return (
    <PageContent aria-hidden>
      <DomainOverviewResultsLoading />
    </PageContent>
  );
}
