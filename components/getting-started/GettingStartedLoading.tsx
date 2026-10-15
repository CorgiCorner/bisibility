import { PageContent } from "@/components/shell/PageContent";
import { SETUP_STEP_DEFINITIONS } from "@/lib/getting-started/setup-steps";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} />;
}

export function GettingStartedLoading() {
  return (
    <PageContent variant="constrained" aria-busy="true" aria-hidden className="grid gap-5">
      <div className="flex min-w-0 items-center gap-2">
        <Bar className="h-5 w-[74px]" />
        <Bar className="h-3.5 w-1 rounded-full" />
        <Bar className="size-[22px] shrink-0 rounded-full" />
        <Bar className="h-4 w-[62px]" />
      </div>

      <div className="overflow-hidden rounded-card border border-border bg-bg-elev">
        <div
          className="grid min-w-0 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]"
          data-testid="getting-started-loading-grid"
        >
          <section className="min-w-0">
            {SETUP_STEP_DEFINITIONS.map((step, index) => (
              <div className={index > 0 ? "border-t border-border" : undefined} key={step.id}>
                <div
                  className={cn(
                    "flex items-center gap-3 px-5 pt-3.5",
                    index === 1 ? "pb-3.5 lg:pb-1.5" : "pb-3.5",
                  )}
                >
                  <Bar className="size-5 shrink-0 rounded-full" />
                  <div className="min-w-0 flex-1">
                    <Bar className={cn("h-5", index === 1 ? "w-[148px]" : "w-[126px]")} />
                    {index > 2 ? <Bar className="mt-1 h-5 w-[148px] max-w-full" /> : null}
                  </div>
                </div>
                {index === 1 ? (
                  <div className="hidden pb-3 pl-[52px] pr-5 lg:block">
                    <Bar className="mb-3 h-[2lh] w-full text-[13px] leading-[1.55]" />
                    <Bar className="h-[34px] w-36" />
                  </div>
                ) : null}
              </div>
            ))}
          </section>
          <section className="hidden min-w-0 self-start p-5 lg:flex">
            <div className="w-full overflow-hidden rounded-card border border-border bg-bg-sunken">
              <div className="flex aspect-[8/5] w-full flex-col items-center justify-center gap-3 px-5">
                <Bar className="h-5 w-[78px] rounded-full bg-bg-elev" />
                <Bar className="h-4 w-[146px] bg-bg-elev" />
                <Bar className="h-3 w-full bg-bg-elev" />
                <Bar className="h-3 w-[82%] bg-bg-elev" />
              </div>
            </div>
          </section>
        </div>
      </div>
    </PageContent>
  );
}
