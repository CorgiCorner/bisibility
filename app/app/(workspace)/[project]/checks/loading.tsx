import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const runRows = ["run-1", "run-2", "run-3", "run-4", "run-5"] as const;
const upcomingDays = ["day-1", "day-2", "day-3"] as const;

function RunsSkeleton() {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
      <div className="flex flex-col gap-3 border-border border-b px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Bar className="h-4 w-[110px]" />
          <Bar className="mt-2 h-3 w-[74px]" />
        </div>
        <div className="flex gap-2">
          <Bar className="h-8 w-[132px] rounded-lg" />
          <Bar className="h-8 w-[118px] rounded-lg" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 px-4 pt-4 lg:grid-cols-4">
        {["stat-1", "stat-2", "stat-3", "stat-4"].map((key) => (
          <div className="rounded-xl border border-border p-3" key={key}>
            <Bar className="h-2.5 w-[72px]" />
            <Bar className="mt-2 h-5 w-[42px]" />
          </div>
        ))}
      </div>
      <div className="mx-4 mt-3 rounded-xl border border-border bg-bg-sunken px-3.5 py-3">
        <Bar className="h-3 w-[180px]" />
        <Bar className="mt-3 h-7 w-full" />
      </div>
      <div className="flex flex-wrap gap-1.5 px-4 py-3">
        {["filter-1", "filter-2", "filter-3", "filter-4"].map((key) => (
          <Bar className="h-8 w-[76px] rounded-lg" key={key} />
        ))}
      </div>
      <div className="border-border border-y">
        {runRows.map((key) => (
          <div
            className="grid grid-cols-[96px_minmax(120px,1fr)_minmax(100px,1fr)] gap-4 border-border-soft border-b px-3 py-3 last:border-b-0"
            key={key}
          >
            <Bar className="h-6 w-[72px] rounded-full" />
            <Bar className="h-3.5 w-[82%]" />
            <Bar className="h-3.5 w-[70%]" />
          </div>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3 px-4 py-3.5">
        <Bar className="h-3 w-[190px]" />
        <Bar className="h-8 w-[108px] rounded-lg" />
      </div>
    </div>
  );
}

function UpcomingSkeleton({ slim = false }: Readonly<{ slim?: boolean }>) {
  return (
    <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
      <div className="flex items-start gap-3 border-border border-b px-4 py-3.5">
        <Bar className="h-9 w-9 shrink-0" />
        <div className="min-w-0 flex-1">
          <Bar className="h-4 w-[100px]" />
          <Bar className="mt-2 h-3 w-[190px] max-w-full" />
        </div>
      </div>
      <div className="p-4">
        <Bar className="h-[62px] w-full rounded-xl" />
        <div className={cn("mt-3 grid gap-2", slim ? "grid-cols-2" : "grid-cols-1")}>
          {upcomingDays.map((key) => (
            <Bar className="h-14 w-full rounded-xl" key={key} />
          ))}
        </div>
      </div>
    </div>
  );
}

function StripSkeleton() {
  return (
    <>
      <div className="rounded-[14px] border border-border bg-bg-elev px-4 py-3">
        <Bar className="h-3 w-full max-w-[560px]" />
      </div>
      <div className="flex gap-2 overflow-hidden">
        <Bar className="h-10 w-[156px] shrink-0 rounded-full" />
        <Bar className="h-10 w-[142px] shrink-0 rounded-full" />
        <Bar className="h-10 w-[176px] shrink-0 rounded-full" />
      </div>
    </>
  );
}

export default function ChecksLoading() {
  return (
    <PageContent aria-hidden>
      <div className="space-y-3 min-[980px]:hidden">
        <StripSkeleton />
        <RunsSkeleton />
      </div>
      <div className="hidden space-y-3 min-[980px]:block min-[1280px]:hidden">
        <UpcomingSkeleton slim />
        <RunsSkeleton />
      </div>
      <div className="hidden min-[1280px]:grid min-[1280px]:grid-cols-[minmax(0,1fr)_360px] min-[1280px]:items-start min-[1280px]:gap-5">
        <RunsSkeleton />
        <UpcomingSkeleton />
      </div>
    </PageContent>
  );
}
