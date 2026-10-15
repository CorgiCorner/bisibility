import { PageContent } from "@/components/shell/PageContent";
import { LoadingBar as Bar, LoadingPanel as Panel } from "./LoadingPrimitives";

/** Matches the visibility form, rather than the unrelated keyword research search box. */
export function AiVisibilityLoading() {
  return (
    <PageContent variant="section" aria-hidden>
      <div className="grid min-w-0 grid-cols-1 gap-5" data-tracking-loading="ai-visibility">
        <div className="grid h-[4.875em] max-w-3xl content-between text-ui-body sm:h-[3.25em]">
          <Bar className="h-3 w-full" />
          <Bar className="h-3 w-11/12" />
          <Bar className="h-3 w-3/4 sm:hidden" />
        </div>
        <Panel>
          <div className="grid gap-4">
            <div className="grid gap-4 sm:grid-cols-2" data-loading-fields>
              {["brand", "domain", "platform", "target", "country", "language"].map((key) => (
                <div className="grid gap-2" key={key}>
                  <Bar className="h-[1.5em] w-20 text-ui-body" />
                  <Bar
                    className={
                      key === "brand" || key === "domain" ? "h-11 w-full sm:h-10" : "h-10 w-full"
                    }
                  />
                </div>
              ))}
              <Bar className="h-[3.1em] w-full sm:col-span-2 sm:h-[1.55em]" />
              <div className="grid gap-2">
                <Bar className="h-[1.5em] w-32 text-ui-body" />
                <Bar className="h-11 w-full sm:h-10" />
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <Bar className="h-9 w-32" />
              <Bar className="h-9 w-32" />
              <Bar className="h-[3.1em] w-64 max-w-full sm:h-[1.55em]" />
            </div>
            <Bar className="h-[3.1em] w-80 max-w-full sm:h-[1.55em]" />
          </div>
        </Panel>
        <Panel className="flex min-h-[167px] flex-col items-center justify-center gap-2 px-8 py-11">
          <Bar className="h-5 w-52 max-w-full" />
          <Bar className="h-[3.1em] w-80 max-w-full sm:h-[1.55em]" />
        </Panel>
        <Panel>
          <Bar className="h-[1.5em] w-32 text-ui-body" />
          <Bar className="mt-2 h-[1.5em] w-56 max-w-full text-ui-body" />
        </Panel>
      </div>
    </PageContent>
  );
}
