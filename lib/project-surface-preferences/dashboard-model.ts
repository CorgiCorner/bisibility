import { dashboardComparisonSelectionSchema } from "@/lib/dashboard-competitors/selection";
import { dashboardLayoutSchema, presetDashboardLayout } from "@/lib/dashboard-layout/layout";
import type { DashboardLayout, DashboardPreset } from "@/lib/dashboard-layout/types";
import { dashboardLocalSelectionSchema } from "@/lib/dashboard-local/selection";
import { isPublicIdOfType } from "@/lib/db/public-id";
import { MAX_VIEW_REVISION } from "@/lib/saved-views/canonical-model";
import { z } from "zod";
import type { DashboardPreferenceNotice } from "./dashboard-read-model";

export const dashboardPresetSchema = z.enum(["general", "local", "competitors"]);
export const dashboardPresentationSchema = z
  .object({
    schemaVersion: z.literal(1),
    localSelection: dashboardLocalSelectionSchema.nullable().optional(),
    competitorSelection: dashboardComparisonSelectionSchema.nullable().optional(),
    layouts: z
      .object({
        general: dashboardLayoutSchema.optional(),
        local: dashboardLayoutSchema.optional(),
        competitors: dashboardLayoutSchema.optional(),
      })
      .strict(),
  })
  .strict()
  .superRefine((value, ctx) => {
    for (const [preset, layout] of Object.entries(value.layouts)) {
      if (layout && layout.preset !== preset)
        ctx.addIssue({
          code: "custom",
          path: ["layouts", preset],
          message: "Dashboard layout must match its preset",
        });
    }
  });
const preferenceInput = z
  .object({
    projectId: z
      .string()
      .trim()
      .refine((id) => isPublicIdOfType(id, "prj")),
    expectedRevision: z.int().nonnegative().max(MAX_VIEW_REVISION),
  })
  .strict();
export const saveDashboardLayoutSchema = preferenceInput
  .extend({ layout: dashboardLayoutSchema })
  .strict();
export const saveDashboardLocalSelectionSchema = preferenceInput
  .extend({ selection: dashboardLocalSelectionSchema.nullable() })
  .strict();
export const saveDashboardComparisonSelectionSchema = preferenceInput
  .extend({ selection: dashboardComparisonSelectionSchema.nullable() })
  .strict();
export const setDashboardDefaultSchema = preferenceInput
  .extend({ preset: dashboardPresetSchema })
  .strict();
export type DashboardSurfacePreference = {
  projectId: string;
  notice?: DashboardPreferenceNotice;
  revision: number;
  defaultPreset: DashboardPreset;
  presentation: z.infer<typeof dashboardPresentationSchema>;
};

/** Saving a Local draft does not change the personally selected default preset. */
export function dashboardLayoutFor(
  preference: DashboardSurfacePreference,
  explicit?: DashboardPreset,
): DashboardLayout {
  const preset = explicit ?? preference.defaultPreset;
  const stored = preference.presentation.layouts[preset];
  if (stored) return stored;
  return defaultPersonalDashboardLayout(preset);
}

export function defaultPersonalDashboardLayout(preset: DashboardPreset): DashboardLayout {
  // Preserve the existing full-width cards and the two secondary cards in the first personal layout.
  const wide = new Set([
    "organic_kpis",
    "position_trend",
    "data_source",
    "by_market",
    "movers",
    "competitor_comparison",
  ]);
  const layout = presetDashboardLayout(preset);
  const widgets = layout.widgets.map((widget) => ({
    ...widget,
    span: wide.has(widget.id) ? ("wide" as const) : widget.span,
    visible:
      widget.id === "competitor_comparison" && preset !== "competitors" ? true : widget.visible,
  }));
  const peer = widgets.find((widget) => widget.id === "competitor_comparison");
  const ordered = widgets.filter((widget) => widget.id !== "competitor_comparison");
  if (peer)
    ordered.splice(
      preset === "competitors" ? 0 : ordered.findIndex((widget) => widget.id === "movers"),
      0,
      peer,
    );
  return { ...layout, widgets: ordered };
}
