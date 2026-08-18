import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-[10px] bg-bg-sunken", className)} />;
}

const filterWidths = [
  { key: "all", width: "w-[72px]" },
  { key: "rankings", width: "w-[108px]" },
  { key: "pages", width: "w-[88px]" },
  { key: "deploys", width: "w-[96px]" },
  { key: "notes", width: "w-[84px]" },
] as const;

const groups = [
  { key: "today", rows: ["t1", "t2", "t3"] },
  { key: "yesterday", rows: ["y1", "y2", "y3"] },
] as const;

function TimelineRow() {
  return (
    <div className="flex items-start gap-3.5 border-border-soft border-b px-5 py-[13px]">
      <Bar className="mt-2 h-[9px] w-[9px] shrink-0 rounded-full" />
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[124px_minmax(0,1fr)_56px]">
        <div className="grid gap-1.5">
          <Bar className="h-3 w-[92px]" />
          <Bar className="h-2.5 w-[46px]" />
        </div>
        <div className="grid min-w-0 gap-2">
          <Bar className="h-3.5 w-[56%]" />
          <Bar className="h-3 w-[70%]" />
          <Bar className="h-3 w-[44%]" />
        </div>
        <Bar className="hidden h-4 w-[40px] md:block" />
      </div>
    </div>
  );
}

export default function TimelineLoading() {
  return (
    <PageContent aria-hidden className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div className="grid gap-2">
          <Bar className="h-5 w-[120px]" />
          <Bar className="h-3 w-[190px]" />
        </div>
        <Bar className="h-9 w-[92px]" />
      </div>

      <Bar className="h-10 w-full" />

      <div className="flex min-w-0 flex-wrap gap-[7px]">
        {filterWidths.map((filter) => (
          <Bar className={cn("h-8 rounded-lg", filter.width)} key={filter.key} />
        ))}
      </div>

      {groups.map((group) => (
        <section key={group.key}>
          <Bar className="mb-[9px] h-2.5 w-[80px]" />
          <div className="overflow-hidden rounded-[14px] border border-border bg-bg-elev">
            {group.rows.map((key) => (
              <TimelineRow key={key} />
            ))}
          </div>
        </section>
      ))}
    </PageContent>
  );
}
