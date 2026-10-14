import { dashboardComparisonSelectionSchema } from "@/lib/dashboard-competitors/selection";
import { dashboardLayoutSchema } from "@/lib/dashboard-layout/layout";
import { dashboardLocalSelectionSchema } from "@/lib/dashboard-local/selection";
import { viewRevisionSchema } from "@/lib/saved-views/canonical-model";
import { SavedViewUnavailableError } from "@/lib/saved-views/errors";
import {
  type DashboardSurfacePreference,
  dashboardPresentationSchema,
  dashboardPresetSchema,
} from "./dashboard-model";

export type DashboardPreferenceNotice = Readonly<{
  kind: "unsupported_version" | "invalid_layout" | "unavailable_default";
  scopeUnavailable: boolean;
}>;
export type DashboardPreferenceRow = Readonly<{
  revision: number;
  schemaVersion: number;
  defaultPresetId: string;
  defaultSavedViewId: string | null;
  defaultSavedViewPublicId: string | null;
  presentation: unknown;
}>;
const object = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

/** Projection is read-only; an unsupported record is never a valid mutation base. */
export function projectDashboardPreference(
  row: DashboardPreferenceRow | null,
  projectId: string,
): DashboardSurfacePreference {
  if (row && !viewRevisionSchema.safeParse(row.revision).success)
    throw new SavedViewUnavailableError();
  const preset = dashboardPresetSchema.safeParse(row?.defaultPresetId ?? "general");
  const raw = row?.presentation ?? { schemaVersion: 1, layouts: {} };
  const parsed = dashboardPresentationSchema.safeParse(raw);
  const result: DashboardSurfacePreference = {
    projectId,
    revision: row?.revision ?? 0,
    defaultPreset: preset.success ? preset.data : "general",
    presentation: { schemaVersion: 1, layouts: {} },
  };
  const source = object(raw);
  const unsupported = Boolean(row && (row.schemaVersion !== 1 || source?.schemaVersion !== 1));
  const invalidDefault =
    !preset.success || Boolean(row?.defaultSavedViewId || row?.defaultSavedViewPublicId);
  if (!unsupported && parsed.success) result.presentation = parsed.data;
  else if (!unsupported && source) {
    const layouts = object(source.layouts);
    for (const name of dashboardPresetSchema.options) {
      const layout = dashboardLayoutSchema.safeParse(layouts?.[name]);
      if (layout.success && layout.data.preset === name)
        result.presentation.layouts[name] = layout.data;
    }
    const selection = dashboardLocalSelectionSchema.nullable().safeParse(source.localSelection);
    if (selection.success) result.presentation.localSelection = selection.data;
    const comparison = dashboardComparisonSelectionSchema
      .nullable()
      .safeParse(source.competitorSelection);
    if (comparison.success) result.presentation.competitorSelection = comparison.data;
  }
  if (unsupported || invalidDefault || !parsed.success)
    result.notice = {
      kind: unsupported
        ? "unsupported_version"
        : invalidDefault
          ? "unavailable_default"
          : "invalid_layout",
      scopeUnavailable: unsupported || invalidDefault,
    };
  return result;
}

export function requireWritableDashboardPreference(preference: DashboardSurfacePreference) {
  if (preference.notice) throw new SavedViewUnavailableError();
  return preference;
}
