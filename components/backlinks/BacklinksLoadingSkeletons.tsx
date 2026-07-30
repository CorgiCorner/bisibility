import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[8px] bg-bg-sunken", className)} />;
}

const summaryKeys = ["authority", "backlinks", "domains", "spam"] as const;
const tableHeaderKeys = ["source", "target", "anchor", "authority", "first-seen"] as const;
const tableRowKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8"] as const;

function AnalyzeCardLoading() {
  return (
    <div className="rounded-[14px] border border-border bg-bg-elev p-4 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <Bar className="h-10 flex-1 rounded-[9px] md:min-w-[240px]" />
        <Bar className="h-10 md:w-[196px]" />
        <Bar className="h-10 md:w-[132px]" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bar className="h-5 w-9 rounded-full" />
          <Bar className="h-3 w-[164px]" />
        </div>
        <div className="flex items-center gap-4">
          <Bar className="h-3 w-[112px]" />
          <Bar className="h-9 w-[216px]" />
        </div>
      </div>
    </div>
  );
}

function IdleStateLoading() {
  return (
    <div className="flex min-h-[420px] flex-col items-center justify-center">
      <Bar className="size-16 rounded-full" />
      <Bar className="mt-5 h-5 w-[210px]" />
      <div className="mt-5 grid w-full max-w-[420px] gap-2">
        <Bar className="mx-auto h-3 w-full" />
        <Bar className="mx-auto h-3 w-[88%]" />
        <Bar className="mx-auto h-3 w-[76%]" />
      </div>
    </div>
  );
}

function ResultsTableLoading() {
  return (
    <div className="min-w-0 overflow-hidden rounded-[14px] border border-border bg-bg-elev">
      <div className="flex flex-wrap items-center gap-2.5 border-b border-border px-4 py-3">
        <Bar className="h-8 w-[86px]" />
        <Bar className="h-3 w-[210px]" />
        <Bar className="ml-auto h-8 w-[84px]" />
      </div>
      <div className="min-w-0 overflow-x-auto">
        <div className="min-w-[840px]">
          <div className="grid h-[42px] grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_minmax(160px,1fr)_92px_112px] items-center gap-4 border-b border-border bg-bg-sunken px-4">
            {tableHeaderKeys.map((key, index) => (
              <Bar className={cn("h-2.5 bg-border", index === 0 ? "w-[82px]" : "w-11")} key={key} />
            ))}
          </div>
          {tableRowKeys.map((key, index) => (
            <div
              className="grid h-[58px] grid-cols-[minmax(220px,1.5fr)_minmax(180px,1fr)_minmax(160px,1fr)_92px_112px] items-center gap-4 border-b border-border-soft px-4"
              key={key}
            >
              <Bar className={cn("h-3.5", index % 2 === 0 ? "w-[72%]" : "w-[58%]")} />
              <Bar className="h-3 w-[68%]" />
              <Bar className="h-3 w-[62%]" />
              <Bar className="h-6 w-10 rounded-full" />
              <Bar className="h-3 w-[74px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function BacklinksResultsLoading() {
  return (
    <div aria-label="Backlinks loading" className="grid min-w-0 gap-4">
      <div className="flex flex-wrap items-center gap-2.5">
        <Bar className="h-7 w-[142px] rounded-full" />
        <Bar className="h-3 w-[268px]" />
        <Bar className="h-6 w-[148px] rounded-full" />
      </div>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {summaryKeys.map((key) => (
          <div className="rounded-[14px] border border-border bg-bg-elev p-4" key={key}>
            <Bar className="h-2.5 w-20" />
            <Bar className="mt-3 h-6 w-16" />
          </div>
        ))}
      </div>
      <ResultsTableLoading />
    </div>
  );
}

export function BacklinksPageLoading() {
  return (
    <PageContent aria-hidden className="grid gap-4">
      <AnalyzeCardLoading />
      <IdleStateLoading />
    </PageContent>
  );
}
