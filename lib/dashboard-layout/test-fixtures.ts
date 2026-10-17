import type { DashboardAccess, DashboardTranslator } from "./types";

export const organicAccess: DashboardAccess = Object.freeze({
  projectId: "synthetic-project",
  projectReadAuthorized: true,
  competitorsReadAuthorized: false,
  capabilities: Object.freeze([
    "organic_reports",
    "position_history",
    "keyword_highlights",
    "connection_details",
    "market_rollup",
  ] as const),
});
const messages: Record<string, string> = {
  title: "Customize dashboard",
  viewDetails: "About this view",
  viewHelp: "This view shows saved results. It does not run checks.",
  viewHelpClose: "Close",
  presentationOnly: "Personal display only. Schedules and paid checks do not change.",
  preset: "Dashboard preset",
  resetPreset: "Reset to preset",
  save: "Save",
  cancel: "Cancel",
  saving: "Saving display preferences.",
  conflict:
    "Preferences changed elsewhere. Your draft is preserved; review the current layout before saving.",
  saveError: "Could not save. Your draft and previous default are preserved.",
  saved: "Display preferences saved.",
  moved: "Moved {title} to position {position}.",
  show: "Show {title}",
  hide: "Hide {title}",
  moveUp: "Move {title} up",
  moveDown: "Move {title} down",
  reorder: "Reorder {title}",
  reorderHint: "Drag a handle, or use arrow keys, Home and End to reorder.",
  widgetHelp: "About {title}",
  span: "Width of {title}",
  "spans.standard": "Standard",
  "spans.wide": "Wide",
  "presets.general": "General",
  "presets.local": "Local SEO",
  "presets.competitors": "Competitors",
  shellUnavailable: "Context is unavailable. This does not mean zero.",
  widgetUnavailable: "This section's stored report is unavailable.",
  widgetLoading: "Loading stored report.",
  widgetError: "This section could not be read. Other sections remain available.",
  "reasons.missing_project_access": "Project read access is required.",
  "reasons.preset_mismatch": "This section uses a different preset scope.",
  "reasons.missing_competitors_access": "Competitor read access is required.",
  "reasons.missing_local_subject": "Select an explicit business identity revision for Local SEO.",
  "reasons.foreign_local_subject": "The selected business does not belong to this project.",
  "reasons.missing_competitor_scope": "Select an explicit competitor comparison scope.",
  "reasons.foreign_competitor_scope": "The competitor scope does not belong to this project.",
  "reasons.missing_capability":
    "The stored data capability required by this section is unavailable.",
};
const widgetLabels: Record<string, string> = {
  organic_kpis: "Organic metrics",
  position_trend: "Position history",
  position_distribution: "Position distribution",
  recent_targets: "Recent targets",
  data_source: "Data source",
  by_market: "By market",
  movers: "Movers",
  local_business_results: "Local Google results",
  competitor_comparison: "Competitor comparison",
  visibility_history: "Visibility history",
  contributors: "Contributors",
  quality_history: "Quality history",
};
for (const [id, label] of Object.entries(widgetLabels)) {
  messages[`widgets.${id}.label`] = label;
  messages[`widgets.${id}.description`] = `Stored report for ${label.toLowerCase()}.`;
}
for (const id of ["scope", "mode", "health", "budget", "coverage"])
  messages[`shell.${id}`] = `${id} context`;

/** Synthetic English only for test/story source, never a production fallback. */
export const dashboardFixtureTranslate: DashboardTranslator = (key, values) => {
  let text = messages[key] ?? key;
  for (const [name, value] of Object.entries(values ?? {}))
    text = text.replaceAll(`{${name}}`, String(value));
  return text;
};
