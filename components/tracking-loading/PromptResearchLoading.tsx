import { PageContent } from "@/components/shell/PageContent";
import { LoadingBar as Bar, LoadingTable, LoadingPanel as Panel } from "./LoadingPrimitives";

/** Search, market/cost line and the keyword list or question table. */
export function PromptResearchLoading() {
  return (
    <PageContent variant="section" aria-hidden>
      <div className="grid min-w-0 gap-4" data-tracking-loading="prompt-research">
        <Bar className="h-4 w-full max-w-2xl" />
        <Panel>
          <div className="grid gap-3" data-loading-search>
            <Bar className="h-4 w-24" />
            <div className="flex gap-2">
              <Bar className="h-10 flex-1" />
              <Bar className="h-10 w-24" />
            </div>
            <Bar className="h-3 w-full max-w-md" />
            <Bar className="h-3 w-64 max-w-full" />
          </div>
        </Panel>
        <Panel>
          <div className="grid gap-3">
            <Bar className="h-5 w-56 max-w-full" />
            <LoadingTable columns={[6, 65, 22, 7]} />
          </div>
        </Panel>
      </div>
    </PageContent>
  );
}
