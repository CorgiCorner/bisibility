import { completeDashboardLayout, parseDashboardLayout, presetDashboardLayout } from "./layout";
import { dashboardWidget } from "./registry";
import type {
  DashboardAccess,
  DashboardComposition,
  DashboardLayout,
  DashboardPreset,
  ProjectionId,
  ShellId,
  WidgetDefinition,
  WidgetReason,
} from "./types";

export const mandatoryDashboardShell: readonly ShellId[] = Object.freeze([
  "scope",
  "mode",
  "health",
  "budget",
  "coverage",
]);
const shellProjections: readonly ProjectionId[] = Object.freeze([
  "scope_context",
  "execution_health",
  "budget_status",
  "coverage_summary",
]);

function scopedReason(preset: DashboardPreset, access: DashboardAccess): WidgetReason | null {
  if (access.projectReadAuthorized !== true || !access.projectId) return "missing_project_access";
  if (preset === "local") {
    const subject = access.localSubject;
    if (!subject?.entityId || !subject.identityRevisionId) return "missing_local_subject";
    if (subject.projectId !== access.projectId) return "foreign_local_subject";
  }
  if (preset === "competitors") {
    if (access.competitorsReadAuthorized !== true) return "missing_competitors_access";
    if (!access.competitorScope?.selectionRevisionId) return "missing_competitor_scope";
    if (access.competitorScope.projectId !== access.projectId) return "foreign_competitor_scope";
  }
  return null;
}

function unavailable(
  definition: WidgetDefinition,
  layout: DashboardLayout,
  access: DashboardAccess,
): WidgetReason | null {
  const scopeReason = scopedReason(layout.preset, access);
  if (scopeReason) return scopeReason;
  if (!definition.presets.includes(layout.preset)) return "preset_mismatch";
  if (definition.permission === "competitors_read" && access.competitorsReadAuthorized !== true)
    return "missing_competitors_access";
  if (definition.capabilities.some((capability) => !access.capabilities.includes(capability)))
    return "missing_capability";
  return null;
}

/**
 * Pure planning, never query execution. The host first authenticates/scopes the
 * project and then binds these finite projection IDs to its read-only loaders.
 * Unresolved explicit Local/Competitors scope must not become an all-project read.
 */
export function composeDashboardLayout(
  layout: DashboardLayout,
  access: DashboardAccess,
): DashboardComposition {
  const completed = completeDashboardLayout(layout);
  const widgets = completed.widgets.map((selection) => {
    const definition = dashboardWidget(selection.id);
    return Object.freeze({
      selection,
      definition,
      reason: unavailable(definition, completed, access),
    });
  });
  const authorized = access.projectReadAuthorized === true && Boolean(access.projectId);
  // Metadata shell stays visible, but unresolved explicit scope must not trigger
  // an all-project coverage aggregation or read a foreign subject/set.
  const validScope = scopedReason(completed.preset, access) === null;
  const shell = authorized
    ? shellProjections.filter((id) => id !== "coverage_summary" || validScope)
    : [];
  const details = [
    ...new Set(
      widgets.flatMap((widget) =>
        widget.selection.visible && widget.reason === null
          ? [...widget.definition.projections]
          : [],
      ),
    ),
  ];
  return Object.freeze({
    layout: completed,
    shell: mandatoryDashboardShell,
    widgets: Object.freeze(widgets),
    authorized,
    projections: Object.freeze({
      shell: Object.freeze([...shell]),
      details: Object.freeze(details),
      all: Object.freeze([...new Set([...shell, ...details])]),
    }),
  });
}

export function resolveDashboardLayout(
  input: unknown,
  access: DashboardAccess,
): { status: "invalid_layout" } | { status: "resolved"; composition: DashboardComposition } {
  const layout =
    input === null || input === undefined ? presetDashboardLayout() : parseDashboardLayout(input);
  return layout
    ? { status: "resolved", composition: composeDashboardLayout(layout, access) }
    : { status: "invalid_layout" };
}
