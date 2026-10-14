import { describe, expect, it } from "vitest";
import { beginDashboardDraft, dashboardDraftIsDirty } from "./draft";
import { presetDashboardLayout } from "./layout";
import { dashboardDropIndex, moveDashboardWidgetTo } from "./reorder";

describe("dashboard reorder", () => {
  it("moves across the list while preserving finite selections, revision, and the saved layout", () => {
    const state = beginDashboardDraft(presetDashboardLayout(), 7);
    const next = moveDashboardWidgetTo(state, "quality_history", 0);
    expect(next.draft.widgets[0].id).toBe("quality_history");
    expect(next.expectedRevision).toBe(7);
    expect(next.base).toBe(state.base);
    expect(next.draft.preset).toBe(state.draft.preset);
    expect(next.draft.widgets).toHaveLength(state.draft.widgets.length);
    expect(next.movement).toEqual({ id: "quality_history", position: 1 });
    expect([...next.draft.widgets].sort((a, b) => a.id.localeCompare(b.id))).toEqual(
      [...state.draft.widgets].sort((a, b) => a.id.localeCompare(b.id)),
    );
    expect(dashboardDraftIsDirty(state)).toBe(false);
  });

  it("rejects invalid targets and saving, and retains the conflict fence", () => {
    const state = beginDashboardDraft(presetDashboardLayout(), 7);
    for (const target of [-1, 12, 0.5, Number.NaN, Number.POSITIVE_INFINITY])
      expect(moveDashboardWidgetTo(state, "organic_kpis", target)).toBe(state);
    expect(moveDashboardWidgetTo(state, "organic_kpis", 0)).toBe(state);
    const saving = { ...state, status: "saving" as const };
    expect(moveDashboardWidgetTo(saving, "organic_kpis", 11)).toBe(saving);
    const conflicted = moveDashboardWidgetTo({ ...state, status: "conflict" }, "organic_kpis", 11);
    expect(conflicted.status).toBe("conflict");
    expect(conflicted.expectedRevision).toBe(7);
  });

  it("resolves insertion slots for variable row heights in content coordinates", () => {
    const centres = [25, 90, 180, 250];
    expect(dashboardDropIndex(centres, 1, 0)).toBe(0);
    expect(dashboardDropIndex(centres, 1, 90)).toBe(1);
    expect(dashboardDropIndex(centres, 1, 210)).toBe(2);
    expect(dashboardDropIndex(centres, 1, 300)).toBe(3);
    expect(dashboardDropIndex(centres, 3, 90)).toBe(1);
  });
});
