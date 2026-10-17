export const widgetIds = [
  "organic_kpis",
  "position_trend",
  "position_distribution",
  "recent_targets",
  "data_source",
  "by_market",
  "movers",
  "local_business_results",
  "competitor_comparison",
  "visibility_history",
  "contributors",
  "quality_history",
] as const;
export type WidgetId = (typeof widgetIds)[number];
export type DashboardPreset = "general" | "local" | "competitors";
export type WidgetSpan = "standard" | "wide";
export type WidgetSelection = Readonly<{ id: WidgetId; visible: boolean; span: WidgetSpan }>;
export type DashboardLayout = Readonly<{
  schemaVersion: 1;
  preset: DashboardPreset;
  widgets: readonly WidgetSelection[];
}>;
export type ShellId = "scope" | "mode" | "health" | "budget" | "coverage";
export type ProjectionId =
  | "scope_context"
  | "execution_health"
  | "budget_status"
  | "coverage_summary"
  | "organic_summary"
  | "position_history"
  | "keyword_highlights"
  | "connection_details"
  | "market_rollup"
  | "local_business_observations"
  | "competitor_comparison"
  | "visibility_history"
  | "contributions"
  | "quality_history";
export type CapabilityId =
  | "organic_reports"
  | "position_history"
  | "keyword_highlights"
  | "connection_details"
  | "market_rollup"
  | "local_business_observations"
  | "competitor_reports"
  | "visibility_history"
  | "contributions"
  | "quality_history";
export type WidgetDefinition = Readonly<{
  id: WidgetId;
  labelKey: `widgets.${WidgetId}.label`;
  descriptionKey: `widgets.${WidgetId}.description`;
  presets: readonly DashboardPreset[];
  resultKinds: readonly ("organic_result" | "local_pack")[];
  permission: "project_read" | "competitors_read";
  capabilities: readonly CapabilityId[];
  projections: readonly ProjectionId[];
  spans: readonly WidgetSpan[];
}>;
export type WidgetReason =
  | "missing_project_access"
  | "preset_mismatch"
  | "missing_competitors_access"
  | "missing_local_subject"
  | "foreign_local_subject"
  | "missing_competitor_scope"
  | "foreign_competitor_scope"
  | "missing_capability";

/** Trusted host adapter input, not an authorization proof or client request DTO. */
export type DashboardAccess = Readonly<{
  projectId: string;
  projectReadAuthorized: boolean;
  competitorsReadAuthorized: boolean;
  capabilities: readonly CapabilityId[];
  localSubject?: Readonly<{
    projectId: string;
    entityId: string;
    identityRevisionId: string;
  }> | null;
  competitorScope?: Readonly<{ projectId: string; selectionRevisionId: string }> | null;
}>;
export type ResolvedWidget = Readonly<{
  selection: WidgetSelection;
  definition: WidgetDefinition;
  reason: WidgetReason | null;
}>;
export type ProjectionPlan = Readonly<{
  shell: readonly ProjectionId[];
  details: readonly ProjectionId[];
  all: readonly ProjectionId[];
}>;
export type DashboardComposition = Readonly<{
  layout: DashboardLayout;
  shell: readonly ShellId[];
  widgets: readonly ResolvedWidget[];
  projections: ProjectionPlan;
  authorized: boolean;
}>;
export type DashboardMessageKey =
  | WidgetDefinition["labelKey" | "descriptionKey"]
  | `reasons.${WidgetReason}`
  | `presets.${DashboardPreset}`
  | `shell.${ShellId}`
  | `spans.${WidgetSpan}`
  | "title"
  | "presentationOnly"
  | "preset"
  | "resetPreset"
  | "show"
  | "hide"
  | "moveUp"
  | "moveDown"
  | "reorder"
  | "reorderHint"
  | "widgetHelp"
  | "save"
  | "cancel"
  | "saving"
  | "conflict"
  | "saveError"
  | "saved"
  | "moved"
  | "shellUnavailable"
  | "widgetUnavailable"
  | "widgetLoading"
  | "widgetError"
  | "widgetLoadOnSave"
  | "viewDetails"
  | "viewHelp"
  | "viewHelpClose"
  | "span";
export type DashboardTranslator = (
  key: DashboardMessageKey,
  values?: Readonly<Record<string, string | number>>,
) => string;
