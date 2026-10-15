import { PageContent } from "@/components/shell/PageContent";
import { presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import type { DashboardPreset, WidgetId } from "@/lib/dashboard-layout/types";
import { LoadingBar as Bar, LoadingPanel as Panel } from "./LoadingPrimitives";

function Widget({ id }: Readonly<{ id?: WidgetId }>) {
  if (id === "organic_kpis")
    return (
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {["visibility", "position", "top10", "keywords"].map((key) => (
          <Panel className="px-4.5 py-4" key={key}>
            <Bar className="h-2.5 w-16 max-w-full" />
            <Bar className="mt-[9px] h-7 w-20 max-w-full" />
          </Panel>
        ))}
      </div>
    );
  const chart = id === "position_trend" || id === "position_distribution";
  return (
    <Panel className={chart ? "px-5 py-4.5" : undefined}>
      <Bar className="h-4 w-40 max-w-full" />
      <Bar className="mt-2 h-3 w-56 max-w-full" />
      {chart ? (
        <Bar
          className={id === "position_trend" ? "mt-3 h-[250px] w-full" : "mt-4.5 h-[190px] w-full"}
        />
      ) : (
        <div className="mt-4 grid gap-3">
          {["first", "second", "third"].map((key) => (
            <Bar className="h-9 w-full" key={key} />
          ))}
        </div>
      )}
    </Panel>
  );
}

/** No request/identity or personal layout is inferred before the loader resolves it. */
export function DashboardLoadingContent({ preset }: Readonly<{ preset?: DashboardPreset }>) {
  const widgets = preset
    ? presetDashboardLayout(preset).widgets.filter((widget) => widget.visible)
    : null;
  return (
    <div aria-hidden className="flex min-w-0 flex-col gap-4" data-tracking-loading="dashboard">
      <div
        className="flex flex-wrap items-center justify-between gap-3"
        data-loading-dashboard-toolbar
      >
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <Bar className="h-8.5 w-32" />
          <Bar className="h-8.5 w-36" />
          <Bar className="h-8.5 w-28" />
          <Bar className="h-8.5 w-8.5" />
        </div>
        {preset !== "competitors" ? <Bar className="h-8.5 w-28" /> : null}
      </div>
      {preset === "local" || preset === "competitors" ? (
        <Bar className="h-8.5 w-64 max-w-full" />
      ) : null}
      <div className="flex flex-wrap items-center gap-3" data-loading-dashboard-coverage>
        <Bar className="h-5 w-40" />
        <Bar className="h-5 w-32" />
        <Bar className="h-5 w-36" />
      </div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {widgets
          ? widgets.map(({ id, span }) => (
              <div
                className={span === "wide" ? "min-w-0 lg:col-span-2" : "min-w-0"}
                data-loading-widget={id}
                key={id}
              >
                <Widget id={id} />
              </div>
            ))
          : ["first", "second"].map((key) => <Widget key={key} />)}
      </div>
    </div>
  );
}

export function DashboardLoading() {
  return (
    <PageContent>
      <DashboardLoadingContent />
    </PageContent>
  );
}
