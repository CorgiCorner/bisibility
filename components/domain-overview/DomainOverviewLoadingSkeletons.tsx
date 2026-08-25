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
        <div className="rounded-[13px] border border-border bg-bg-elev px-4.5 py-4" key={key}>
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
    <div aria-busy="true" aria-label="Domain Overview loading" className="grid min-w-0 gap-4.5">
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

function AnalyzeCardLoading() {
  return (
    <div
      className="rounded-[14px] border border-border bg-bg-elev p-4.5 sm:p-5"
      data-skeleton="analyze-card"
    >
      <div className="grid gap-3.5">
        <div className="flex flex-col gap-2.5 md:flex-row md:items-start">
          <Bar
            className="h-10 flex-1 rounded-[9px] border border-border-strong md:min-w-[320px]"
            data-skeleton="target-control"
          />
          <div className="md:w-[230px]" data-skeleton="market-wrapper">
            <Bar
              className="h-10 w-full rounded-[9px] border border-border-strong"
              data-skeleton="market-control"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Bar className="h-3.5 w-3.5 rounded-full" />
            <Bar className="h-3 w-[320px] max-w-full" />
          </div>
          <div className="ml-auto flex items-center gap-4">
            <Bar className="h-3 w-[112px]" />
            <Bar className="h-[37px] min-w-[200px] rounded-[9px]" data-skeleton="analyze-action" />
          </div>
        </div>
      </div>
    </div>
  );
}

function IdlePanelLoading() {
  return (
    <div
      className="flex flex-col items-center justify-center rounded-2xl border border-border bg-bg-elev px-8 py-11 text-center"
      data-skeleton="idle-panel"
    >
      <Bar className="h-[54px] w-[54px] rounded-[14px]" data-skeleton="idle-icon" />
      <Bar className="mt-4.5 h-5 w-[180px]" />
      <div className="mt-[7px] grid gap-1.5">
        {["provider", "cache", "keywords"].map((key, index) => (
          <div className="flex items-center gap-2" data-skeleton="idle-bullet" key={key}>
            <Bar className="h-1.5 w-1.5 rounded-full" />
            <Bar className="h-3" style={{ width: `${250 + index * 28}px` }} />
          </div>
        ))}
      </div>
    </div>
  );
}

export function DomainOverviewPageLoading() {
  return (
    <PageContent aria-hidden>
      <section
        aria-busy="true"
        aria-label="Domain Overview page loading"
        className="grid min-w-0 gap-4"
      >
        <AnalyzeCardLoading />
        <IdlePanelLoading />
      </section>
    </PageContent>
  );
}
