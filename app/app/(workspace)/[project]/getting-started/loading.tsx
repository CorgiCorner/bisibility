import { PageContent } from "@/components/shell/PageContent";
import { cn } from "@/lib/ui/cn";

function Bar({ className }: Readonly<{ className?: string }>) {
  return <div className={cn("animate-pulse rounded-control bg-bg-sunken", className)} />;
}

const steps = ["create", "keywords", "source", "check"] as const;
const cards = ["team", "ai", "github"] as const;

export default function GettingStartedLoading() {
  return (
    <PageContent variant="constrained" className="grid gap-5">
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
            {steps.map((step, index) => (
              <div
                className={cn(
                  "flex min-h-[49px] items-center gap-3 px-5 py-3.5",
                  index > 0 && "border-t border-border-soft",
                )}
                key={step}
              >
                <Bar className="size-5 shrink-0 rounded-full" />
                <Bar className={cn("h-4", index === 1 ? "w-[148px]" : "w-[126px]")} />
              </div>
            ))}
          </section>
          <section className="hidden min-w-0 p-5 lg:flex">
            <div className="flex min-h-[260px] w-full flex-1 items-center justify-center rounded-card border border-dashed border-border-control bg-bg-sunken px-5 py-[22px]">
              <div className="flex w-full max-w-[280px] flex-col items-center gap-3">
                <Bar className="h-5 w-[78px] rounded-full bg-bg-elev" />
                <Bar className="h-4 w-[146px] bg-bg-elev" />
                <Bar className="h-3 w-full bg-bg-elev" />
                <Bar className="h-3 w-[82%] bg-bg-elev" />
              </div>
            </div>
          </section>
        </div>
      </div>

      <section>
        <Bar className="h-2.5 w-[74px]" />
        <div className="mt-2.5 grid grid-cols-[repeat(auto-fit,minmax(190px,1fr))] gap-2.5">
          {cards.map((card) => (
            <div
              className="flex min-h-[90px] flex-col rounded-card border border-border bg-bg-elev px-4 py-3.5"
              key={card}
            >
              <Bar className="size-[17px]" />
              <Bar className="mt-2 h-3.5 w-[132px]" />
              <Bar className="mt-1 h-3 w-[82%]" />
            </div>
          ))}
        </div>
      </section>
    </PageContent>
  );
}
