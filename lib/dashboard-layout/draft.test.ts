import { describe, expect, it } from "vitest";
import {
  beginDashboardDraft,
  cancelDashboardDraft,
  finishDashboardSave,
  requestDashboardSave,
  reviewDashboardConflict,
  updateDashboardDraft,
} from "./draft";
import { presetDashboardLayout } from "./layout";

describe("personal dashboard draft", () => {
  it("reorders immutable selections without changing the previous saved layout or scope policy", () => {
    const base = presetDashboardLayout();
    const initial = beginDashboardDraft(base, 7);
    const moved = updateDashboardDraft(initial, {
      type: "move",
      id: "position_trend",
      direction: "up",
    });
    expect(moved.draft.widgets[0].id).toBe("position_trend");
    expect(base.widgets[0].id).toBe("organic_kpis");
    expect(moved.movement).toEqual({ id: "position_trend", position: 1 });
    expect(cancelDashboardDraft(moved).draft).toEqual(initial.base);
    expect(Object.isFrozen(moved.draft.widgets)).toBe(true);
    expect(requestDashboardSave(initial)).toBeNull();
  });

  it("adds newly available widgets hidden but lets the user edit them", () => {
    const state = beginDashboardDraft({ schemaVersion: 1, preset: "general", widgets: [] }, 0);
    expect(state.draft.widgets.every((widget) => !widget.visible)).toBe(true);
    expect(
      updateDashboardDraft(state, {
        type: "visible",
        id: "contributors",
        visible: true,
      }).draft.widgets.find((widget) => widget.id === "contributors")?.visible,
    ).toBe(true);
  });

  it("emits a finite presentation-only CAS snapshot, blocks concurrent changes, and ignores an obsolete result", () => {
    const editing = updateDashboardDraft(beginDashboardDraft(presetDashboardLayout(), 7), {
      type: "visible",
      id: "movers",
      visible: false,
    });
    const save = requestDashboardSave(editing);
    if (!save) throw new Error("Expected save");
    expect(save.request).toMatchObject({ expectedRevision: 7, attempt: 1 });
    expect(Object.keys(save.request)).toEqual(["attempt", "expectedRevision", "layout"]);
    expect(JSON.stringify(save.request)).not.toContain("schedule");
    expect(
      updateDashboardDraft(save.state, { type: "preset", layout: presetDashboardLayout("local") }),
    ).toBe(save.state);
    expect(cancelDashboardDraft(save.state)).toBe(save.state);
    expect(finishDashboardSave(save.state, { kind: "error", attempt: 0 })).toBe(save.state);
  });

  it("keeps the draft and old expected revision on conflict until explicit review", () => {
    const edited = updateDashboardDraft(beginDashboardDraft(presetDashboardLayout(), 7), {
      type: "visible",
      id: "movers",
      visible: false,
    });
    const save = requestDashboardSave(edited);
    if (!save) throw new Error("Expected save");
    const conflict = finishDashboardSave(save.state, {
      kind: "conflict",
      attempt: save.request.attempt,
      currentRevision: 8,
    });
    expect(conflict.draft).toEqual(edited.draft);
    expect(conflict.base).toEqual(edited.base);
    expect(conflict.expectedRevision).toBe(7);
    expect(requestDashboardSave(conflict)).toBeNull();
    const stillConflict = updateDashboardDraft(conflict, {
      type: "span",
      id: "organic_kpis",
      span: "wide",
    });
    expect(stillConflict.status).toBe("conflict");
    const latest = presetDashboardLayout("local");
    const keep = reviewDashboardConflict(stillConflict, latest, 8, "keep_draft");
    expect(keep.base).toEqual(latest);
    expect(keep.draft).toEqual(stillConflict.draft);
    expect(keep.expectedRevision).toBe(8);
    expect(reviewDashboardConflict(conflict, latest, 8, "use_current").draft).toEqual(latest);
  });

  it("retains both draft and previous default on error; success uses the authoritative response", () => {
    const edited = updateDashboardDraft(beginDashboardDraft(presetDashboardLayout(), 7), {
      type: "span",
      id: "organic_kpis",
      span: "wide",
    });
    const save = requestDashboardSave(edited);
    if (!save) throw new Error("Expected save");
    const error = finishDashboardSave(save.state, { kind: "error", attempt: 1 });
    expect(error.draft).toEqual(edited.draft);
    expect(error.base).toEqual(edited.base);
    expect(error.status).toBe("error");
    const retry = requestDashboardSave(error);
    if (!retry) throw new Error("Expected retry");
    expect(retry.request.attempt).toBe(2);
    const saved = finishDashboardSave(retry.state, {
      kind: "saved",
      attempt: 2,
      revision: 8,
      layout: retry.request.layout,
    });
    expect(saved.status).toBe("saved");
    expect(saved.base).toEqual(edited.draft);
    expect(saved.expectedRevision).toBe(8);
    expect(() =>
      finishDashboardSave(save.state, {
        kind: "saved",
        attempt: 1,
        revision: 7,
        layout: edited.draft,
      }),
    ).toThrow("Invalid dashboard save revision");
  });
});
