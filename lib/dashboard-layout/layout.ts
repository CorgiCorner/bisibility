import { z } from "zod";
import { dashboardWidget } from "./registry";
import { type DashboardLayout, type DashboardPreset, type WidgetId, widgetIds } from "./types";

const widgetSchema = z
  .object({
    id: z.enum(widgetIds),
    visible: z.boolean(),
    span: z.enum(["standard", "wide"]),
  })
  .strict();
export const dashboardLayoutSchema = z
  .object({
    schemaVersion: z.literal(1),
    preset: z.enum(["general", "local", "competitors"]),
    widgets: z.array(widgetSchema).max(widgetIds.length),
  })
  .strict()
  .superRefine((layout, context) => {
    const seen = new Set<WidgetId>();
    for (const [index, selection] of layout.widgets.entries()) {
      if (seen.has(selection.id) || !dashboardWidget(selection.id).spans.includes(selection.span)) {
        context.addIssue({
          code: "custom",
          message: "Invalid dashboard selection",
          path: ["widgets", index],
        });
      }
      seen.add(selection.id);
    }
  });

const general: readonly WidgetId[] = [
  "organic_kpis",
  "position_trend",
  "position_distribution",
  "recent_targets",
  "data_source",
  "by_market",
  "movers",
];
const presets: Readonly<Record<DashboardPreset, readonly WidgetId[]>> = Object.freeze({
  general,
  local: [...general, "local_business_results"],
  competitors: ["competitor_comparison", "data_source"],
});

export function freezeDashboardLayout(layout: DashboardLayout): DashboardLayout {
  return Object.freeze({
    schemaVersion: 1,
    preset: layout.preset,
    widgets: Object.freeze(layout.widgets.map((selection) => Object.freeze({ ...selection }))),
  });
}

/** Missing personal preferences select General, never implicit Local/Competitors. */
export function presetDashboardLayout(preset: DashboardPreset = "general"): DashboardLayout {
  const visible = presets[preset];
  const ordered = [...visible, ...widgetIds.filter((id) => !visible.includes(id))];
  return freezeDashboardLayout({
    schemaVersion: 1,
    preset,
    widgets: ordered.map((id) => ({
      id,
      visible: visible.includes(id),
      span: "standard",
    })),
  });
}

export function parseDashboardLayout(input: unknown): DashboardLayout | null {
  const result = dashboardLayoutSchema.safeParse(input);
  return result.success ? freezeDashboardLayout(result.data) : null;
}

/** Omitted newly available sections are editable but remain hidden, preserving user intent. */
export function completeDashboardLayout(layout: DashboardLayout): DashboardLayout {
  const ids = new Set(layout.widgets.map((item) => item.id));
  return freezeDashboardLayout({
    ...layout,
    widgets: [
      ...layout.widgets,
      ...widgetIds
        .filter((id) => !ids.has(id))
        .map((id) => ({ id, visible: false, span: "standard" as const })),
    ],
  });
}
