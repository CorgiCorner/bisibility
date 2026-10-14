import type { DashboardPreset, WidgetDefinition, WidgetId } from "./types";

const organic: readonly DashboardPreset[] = ["general", "local"];
function widget(
  id: WidgetId,
  projections: WidgetDefinition["projections"],
  capabilities: WidgetDefinition["capabilities"],
  extra: Partial<Pick<WidgetDefinition, "presets" | "resultKinds" | "permission" | "spans">> = {},
): WidgetDefinition {
  const entry: WidgetDefinition = {
    id,
    labelKey: `widgets.${id}.label`,
    descriptionKey: `widgets.${id}.description`,
    presets: Object.freeze([...(extra.presets ?? organic)]),
    resultKinds: Object.freeze([...(extra.resultKinds ?? ["organic_result"])]),
    permission: extra.permission ?? "project_read",
    projections: Object.freeze([...projections]),
    capabilities: Object.freeze([...capabilities]),
    spans: Object.freeze([...(extra.spans ?? ["standard", "wide"])]),
  };
  return Object.freeze(entry);
}

/** These are planning hints, not executable queries or evidence of a shipped capability. */
export const dashboardWidgetRegistry: readonly WidgetDefinition[] = Object.freeze([
  widget("organic_kpis", ["organic_summary"], ["organic_reports"]),
  widget("position_trend", ["position_history"], ["position_history"]),
  widget("position_distribution", ["organic_summary"], ["organic_reports"]),
  widget("recent_targets", ["keyword_highlights"], ["keyword_highlights"]),
  widget("data_source", ["connection_details"], ["connection_details"], {
    presets: ["general", "local", "competitors"],
    resultKinds: [],
  }),
  widget("by_market", ["market_rollup"], ["market_rollup"]),
  widget("movers", ["keyword_highlights"], ["keyword_highlights"]),
  widget(
    "local_business_results",
    ["local_business_observations"],
    ["local_business_observations"],
    {
      presets: ["local"],
      resultKinds: ["local_pack"],
    },
  ),
  widget("competitor_comparison", ["competitor_comparison"], ["competitor_reports"], {
    presets: ["general", "local", "competitors"],
    resultKinds: ["organic_result"],
    permission: "competitors_read",
  }),
  widget("visibility_history", ["visibility_history"], ["visibility_history"]),
  widget("contributors", ["contributions"], ["contributions"]),
  widget("quality_history", ["quality_history"], ["quality_history"], {
    presets: ["general", "local", "competitors"],
    resultKinds: [],
  }),
]);

export function dashboardWidget(id: WidgetId): WidgetDefinition {
  const definition = dashboardWidgetRegistry.find((entry) => entry.id === id);
  if (!definition) throw new Error("Unknown dashboard widget");
  return definition;
}
