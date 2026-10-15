import { PageContent } from "@/components/shell/PageContent";
import { Card } from "@/components/ui/Card";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return (
    <div className={cn("motion-safe:animate-pulse rounded-control bg-bg-sunken", className)} />
  );
}

const filters = ["w-[72px]", "w-[108px]", "w-[88px]", "w-[96px]", "w-[84px]"] as const;
const rows = [0, 1, 2] as const;

function PendingRow() {
  return (
    <div className="flex items-center gap-3.5 border-b border-border px-5 py-[13px] last:border-b-0">
      <div className="grid min-w-0 flex-1 gap-2 md:grid-cols-[124px_minmax(0,1fr)_auto] md:items-center">
        <div className="text-[14px]">
          <Bar className="h-[1lh] w-[92px]" />
          <Bar className="mt-0.5 h-[1lh] w-[46px]" />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <Bar className="size-[22px]" />
            <Bar className="h-[18px] w-[56%]" />
          </div>
          <Bar className="mt-1 h-[calc(1lh+6px)] w-[70%] rounded-full text-[11px]" />
        </div>
        <Bar className="size-7 justify-self-end" />
      </div>
    </div>
  );
}

export function TimelineLoading() {
  return (
    <PageContent aria-busy="true">
      <div aria-hidden className="flex min-w-0 flex-col gap-4">
        <Card className="grid min-w-0 gap-3 p-4 sm:p-5">
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2">
              <Bar className="h-[34px] min-w-0 flex-1" />
              <Bar className="h-[34px] w-20" />
            </div>
            <Bar className="h-[34px] w-28" />
          </div>
          <div className="-mx-4 flex min-w-0 flex-wrap gap-[7px] border-t border-border px-4 pt-3 sm:-mx-5 sm:px-5">
            {filters.map((width) => (
              <Bar className={cn("h-8", width)} key={width} />
            ))}
          </div>
        </Card>
        {[0, 1].map((group) => (
          <section key={group}>
            <Bar className="mb-[9px] h-[1lh] w-20 text-[10px]" />
            <Card className="overflow-hidden p-0" size="lg">
              {rows.map((row) => (
                <PendingRow key={row} />
              ))}
            </Card>
          </section>
        ))}
      </div>
    </PageContent>
  );
}
