import { PageContent } from "@/components/shell/PageContent";
import { LoadingBar as Bar, LoadingTable, LoadingPanel as Panel } from "./LoadingPrimitives";

/** Mirrors AiTrackingClient's shell-owned heading and initial Prompts view. */
export function AiTrackingLoading() {
  return (
    <PageContent variant="section" aria-hidden>
      <div className="min-w-0 space-y-5" data-tracking-loading="ai-tracking">
        <header className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <Bar className="mt-2 h-10 w-[480px] max-w-full sm:h-5" />
            <Bar className="mt-1 h-4 w-64 max-w-full" />
          </div>
          <div className="flex flex-wrap gap-2">
            <Bar className="h-9 w-24" />
            <Bar className="h-9 w-28" />
          </div>
        </header>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-loading-metrics>
          {["prompts", "runs", "coverage", "schedules"].map((key) => (
            <Panel key={key}>
              <Bar className="h-[1.55em] w-24 max-w-full text-[10px]" />
              <Bar className="mt-2 h-7 w-14" />
              <Bar
                className={`mt-2 w-36 max-w-full ${key === "coverage" || key === "schedules" ? "h-8 sm:h-4" : "h-4"}`}
              />
            </Panel>
          ))}
        </div>
        <Panel className="flex flex-wrap items-center justify-between gap-3 p-3">
          <div className="flex flex-wrap gap-2">
            {["prompts", "runs", "schedules"].map((key) => (
              <Bar className="h-8.5 w-24" key={key} />
            ))}
          </div>
          <Bar className="h-8.5 w-28" />
        </Panel>
        <section className="space-y-3">
          {["context", "generation"].map((key) => (
            <Panel key={key}>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <Bar className="h-5 w-44 max-w-full" />
                  <Bar className="mt-1 h-5 w-96 max-w-full" />
                </div>
                <Bar className="h-8.5 w-36" />
              </div>
            </Panel>
          ))}
          <div className="flex items-center gap-3">
            <Bar className="h-8.5 w-32" />
            <Bar className="h-4 w-20" />
          </div>
          <LoadingTable columns={[50, 400, 190, 100, 100, 185, 220, 160]} rowHeight={77} />
          <Bar className="h-4 w-[640px] max-w-full" />
        </section>
      </div>
    </PageContent>
  );
}
