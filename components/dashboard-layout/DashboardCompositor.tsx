import { Card } from "@/components/ui/Card";
import { SectionTitle } from "@/components/ui/SectionTitle";
import type {
  DashboardComposition,
  DashboardTranslator,
  ShellId,
  WidgetId,
} from "@/lib/dashboard-layout/types";
import type { ReactNode } from "react";
import { DashboardEmptyBody } from "./DashboardEmptyBody";
import { DashboardViewHelp } from "./DashboardViewHelp";

type WidgetContent = Readonly<
  { state: "ready"; content: ReactNode } | { state: "loading" | "error" | "not_loaded" }
>;
export type DashboardCompositorProps = {
  /** One host-owned next step when the requested scope cannot yet be resolved. */
  emptyState?: ReactNode;
  composition: DashboardComposition;
  translate: DashboardTranslator;
  /** Required shell nodes come from trusted host loaders, never saved preferences. */
  shell: Readonly<Record<ShellId, ReactNode>>;
  /** Host-rendered content keyed by the registry, never executable JSON. */
  widgets: Readonly<Partial<Record<WidgetId, WidgetContent>>>;
};

export function DashboardCompositor({
  composition,
  translate: t,
  shell,
  widgets,
  emptyState,
}: DashboardCompositorProps) {
  const shellSection = (id: ShellId) =>
    composition.authorized && (shell[id] == null || shell[id] === false) ? null : (
      <section
        key={id}
        aria-label={t(`shell.${id}`)}
        className={id === "health" || id === "budget" ? "w-full min-w-0 basis-full" : ""}
        data-dashboard-shell={id}
      >
        {composition.authorized && shell[id] != null && shell[id] !== false ? (
          shell[id]
        ) : (
          <p>{t("shellUnavailable")}</p>
        )}
      </section>
    );
  if (emptyState && composition.authorized) {
    return (
      <div className="flex min-w-0 flex-col gap-4">
        {composition.shell.filter((id) => id === "scope").map(shellSection)}
        <div className="relative">
          {emptyState}
          <div className="absolute end-3 top-3">
            <DashboardViewHelp label={t("viewDetails")} description={t("viewHelp")} />
          </div>
        </div>
      </div>
    );
  }
  return (
    <div className="flex min-w-0 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">{composition.shell.map(shellSection)}</div>
      <div className="grid min-w-0 grid-cols-1 gap-4 lg:grid-cols-2">
        {composition.widgets
          .filter(
            ({ selection, definition }) =>
              selection.visible && definition.presets.includes(composition.layout.preset),
          )
          .map(({ selection, definition, reason }) => {
            const data = widgets[selection.id];
            return (
              <section
                key={selection.id}
                aria-label={t(definition.labelKey)}
                data-dashboard-widget={selection.id}
                className={
                  selection.span === "wide" ? "h-full min-w-0 lg:col-span-2" : "h-full min-w-0"
                }
              >
                {reason || !data || data.state !== "ready" ? (
                  <Card className="flex h-full min-h-[24.625rem] flex-col overflow-hidden p-0">
                    <div className="px-5 py-4.5">
                      <div>
                        <SectionTitle>{t(definition.labelKey)}</SectionTitle>
                      </div>
                    </div>
                    <DashboardEmptyBody
                      title={t(data?.state === "loading" ? "widgetLoading" : "widgetNoData")}
                      description={t(
                        reason
                          ? `reasons.${reason}`
                          : !data
                            ? "widgetUnavailable"
                            : data.state === "loading"
                              ? "widgetLoading"
                              : data.state === "not_loaded"
                                ? "widgetLoadOnSave"
                                : "widgetError",
                      )}
                    />
                  </Card>
                ) : (
                  data.content
                )}
              </section>
            );
          })}
      </div>
    </div>
  );
}
