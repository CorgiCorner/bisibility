import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[8px] bg-bg-sunken", className)} />;
}

const tableHeaderKeys = [
  "select",
  "keyword",
  "volume",
  "trend",
  "difficulty",
  "cpc",
  "intent",
  "source",
] as const;
const tableRowKeys = ["r1", "r2", "r3", "r4", "r5", "r6", "r7", "r8", "r9", "r10"] as const;
const tableGrid =
  "grid grid-cols-[50px_minmax(210px,1.5fr)_92px_102px_68px_78px_96px_104px] items-center";

function SearchCardLoading() {
  return (
    <div className="rounded-[14px] border border-border bg-bg-elev p-4 sm:p-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-start">
        <Bar className="h-10 flex-1 rounded-[9px] md:min-w-[240px]" />
        <Bar className="h-10 md:w-[230px]" />
        <Bar className="h-10 md:w-[132px]" />
        <Bar className="h-10 md:w-[132px]" />
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Bar className="h-5 w-9 rounded-full" />
          <Bar className="h-3 w-[190px]" />
          <Bar className="size-3 rounded-full" />
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
    <div className="flex min-h-[258px] flex-col items-center justify-center rounded-[14px] border border-border-strong bg-bg-elev p-8">
      <Bar className="mb-4 size-7 rounded-full bg-accent-soft" />
      <Bar className="h-4 w-[190px]" />
      <div className="mt-2.5 grid w-full max-w-[320px] gap-2">
        <Bar className="mx-auto h-3 w-[250px]" />
        <Bar className="mx-auto h-3 w-[292px]" />
        <Bar className="mx-auto h-3 w-[268px]" />
        <Bar className="mx-auto h-3 w-[286px]" />
        <Bar className="mx-auto h-3 w-[232px]" />
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
        <div className="min-w-[930px]">
          <div className={cn(tableGrid, "h-[42px] border-b border-border bg-bg-sunken px-2")}>
            {tableHeaderKeys.map((key, index) => (
              <Bar
                className={cn(
                  "h-2.5 bg-border",
                  index === 0 ? "w-4" : index === 1 ? "w-[82px]" : "w-11",
                )}
                key={key}
              />
            ))}
          </div>
          {tableRowKeys.map((key, rowIndex) => (
            <div className={cn(tableGrid, "h-[54px] border-b border-border-soft px-2")} key={key}>
              <Bar className="size-4 rounded" />
              <Bar className={cn("h-3.5", rowIndex % 2 === 0 ? "w-[72%]" : "w-[58%]")} />
              <Bar className="h-3 w-12" />
              <Bar className="h-6 w-[74px]" />
              <Bar className="h-6 w-10 rounded-full" />
              <Bar className="h-3 w-11" />
              <Bar className="h-6 w-16 rounded-full" />
              <Bar className="h-6 w-[74px]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ResultsDetailLoading() {
  return (
    <div className="min-w-0 rounded-[14px] border border-border bg-bg-elev p-5 lg:self-start">
      <Bar className="h-2.5 w-[92px]" />
      <Bar className="mt-2 h-5 w-[210px]" />
      <Bar className="mt-4 h-3 w-[76%]" />
      <div className="mt-5 border-t border-border pt-4">
        <Bar className="h-2.5 w-[108px]" />
        <div className="mt-3 grid gap-2">
          <Bar className="h-10 w-full" />
          <div className="grid grid-cols-[minmax(0,1fr)_minmax(150px,1fr)] gap-2">
            <Bar className="h-10 w-full" />
            <Bar className="h-10 w-full" />
          </div>
        </div>
        <Bar className="mt-3 h-3 w-[88%]" />
        <Bar className="mt-2 h-3 w-[62%]" />
        <Bar className="mt-3 h-9 w-full" />
      </div>
    </div>
  );
}

export function ResearchResultsLoading() {
  return (
    <div
      aria-label="Research loading"
      className="grid min-w-0 gap-4 lg:grid-cols-[minmax(0,1.65fr)_minmax(300px,1fr)]"
    >
      <ResultsTableLoading />
      <ResultsDetailLoading />
    </div>
  );
}

export function ResearchPageLoading() {
  return (
    <PageContent aria-hidden className="grid gap-4">
      <SearchCardLoading />
      <IdleStateLoading />
    </PageContent>
  );
}
