import { completeDashboardLayout, freezeDashboardLayout, parseDashboardLayout } from "./layout";
import { dashboardWidget } from "./registry";
import type { DashboardLayout, WidgetId, WidgetSpan } from "./types";

export type DashboardDraft = Readonly<{
  base: DashboardLayout;
  draft: DashboardLayout;
  expectedRevision: number;
  status: "editing" | "saving" | "conflict" | "error" | "saved";
  currentRevision: number | null;
  attempt: number;
  movement: Readonly<{ id: WidgetId; position: number }> | null;
}>;
export type DashboardDraftAction =
  | { type: "preset"; layout: DashboardLayout }
  | { type: "reset"; layout: DashboardLayout }
  | { type: "visible"; id: WidgetId; visible: boolean }
  | { type: "span"; id: WidgetId; span: WidgetSpan }
  | { type: "move"; id: WidgetId; direction: "up" | "down" };
export type DashboardSaveRequest = Readonly<{
  attempt: number;
  expectedRevision: number;
  layout: DashboardLayout;
}>;
export type DashboardSaveResult =
  | { kind: "saved"; attempt: number; revision: number; layout: DashboardLayout }
  | { kind: "conflict"; attempt: number; currentRevision: number }
  | { kind: "error"; attempt: number };

function revision(value: number): number {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error("Invalid dashboard revision");
  return value;
}
function checkedLayout(layout: DashboardLayout): DashboardLayout {
  const result = parseDashboardLayout(layout);
  if (!result) throw new Error("Invalid dashboard layout");
  return completeDashboardLayout(result);
}

export function beginDashboardDraft(
  layout: DashboardLayout,
  currentRevision: number,
): DashboardDraft {
  const base = checkedLayout(layout);
  return Object.freeze({
    base,
    draft: base,
    expectedRevision: revision(currentRevision),
    status: "editing",
    currentRevision: null,
    attempt: 0,
    movement: null,
  });
}
export function dashboardDraftIsDirty(state: DashboardDraft): boolean {
  return JSON.stringify(state.base) !== JSON.stringify(state.draft);
}

export function updateDashboardDraft(
  state: DashboardDraft,
  action: DashboardDraftAction,
): DashboardDraft {
  if (state.status === "saving") return state;
  let draft = state.draft;
  let movement: DashboardDraft["movement"] = null;
  if (action.type === "preset") draft = checkedLayout(action.layout);
  else if (action.type === "reset") {
    if (action.layout.preset !== draft.preset) throw new Error("Dashboard reset preset mismatch");
    draft = checkedLayout(action.layout);
  } else {
    const widgets = [...draft.widgets];
    const index = widgets.findIndex((widget) => widget.id === action.id);
    if (index === -1) return state;
    const item = widgets[index];
    if (action.type === "visible") widgets[index] = { ...item, visible: action.visible };
    else if (action.type === "span") {
      if (!dashboardWidget(item.id).spans.includes(action.span)) return state;
      widgets[index] = { ...item, span: action.span };
    } else {
      const target = index + (action.direction === "up" ? -1 : 1);
      if (target < 0 || target >= widgets.length) return state;
      [widgets[index], widgets[target]] = [widgets[target], widgets[index]];
      movement = Object.freeze({ id: item.id, position: target + 1 });
    }
    draft = freezeDashboardLayout({ ...draft, widgets });
  }
  // Editing a conflicted draft does not silently adopt the newer server revision.
  return Object.freeze({
    ...state,
    draft,
    movement,
    status: state.status === "conflict" ? "conflict" : "editing",
  });
}

export function cancelDashboardDraft(state: DashboardDraft): DashboardDraft {
  if (state.status === "saving") return state;
  return Object.freeze({ ...state, draft: state.base, movement: null });
}

export function requestDashboardSave(
  state: DashboardDraft,
): { state: DashboardDraft; request: DashboardSaveRequest } | null {
  if (state.status === "saving" || state.status === "conflict" || !dashboardDraftIsDirty(state))
    return null;
  const attempt = revision(state.attempt + 1);
  return {
    state: Object.freeze({ ...state, status: "saving", attempt, movement: null }),
    request: Object.freeze({
      attempt,
      expectedRevision: state.expectedRevision,
      layout: state.draft,
    }),
  };
}

export function finishDashboardSave(
  state: DashboardDraft,
  result: DashboardSaveResult,
): DashboardDraft {
  if (state.status !== "saving" || result.attempt !== state.attempt) return state;
  if (result.kind === "error") return Object.freeze({ ...state, status: "error" });
  if (result.kind === "conflict")
    return Object.freeze({
      ...state,
      status: "conflict",
      currentRevision: revision(result.currentRevision),
    });
  if (revision(result.revision) <= state.expectedRevision)
    throw new Error("Invalid dashboard save revision");
  const layout = checkedLayout(result.layout);
  return Object.freeze({
    ...state,
    base: layout,
    draft: layout,
    status: "saved",
    expectedRevision: result.revision,
    currentRevision: null,
    movement: null,
  });
}

/** Explicit conflict resolution only after the host presents the current server layout. */
export function reviewDashboardConflict(
  state: DashboardDraft,
  currentLayout: DashboardLayout,
  currentRevision: number,
  choice: "keep_draft" | "use_current",
): DashboardDraft {
  if (state.status !== "conflict") return state;
  const base = checkedLayout(currentLayout);
  const latest = revision(currentRevision);
  if (latest <= state.expectedRevision || latest < (state.currentRevision ?? 0))
    throw new Error("Invalid dashboard conflict revision");
  return Object.freeze({
    ...state,
    base,
    draft: choice === "keep_draft" ? state.draft : base,
    expectedRevision: latest,
    status: "editing",
    currentRevision: null,
    movement: null,
  });
}
