import { DOCS_URL } from "@/lib/site/site";
import { describe, expect, it, vi } from "vitest";
import { commandGroups } from "./command-palette-groups";

describe("commandGroups", () => {
  it("opens external docs without routing through Next", () => {
    const push = vi.fn();
    const setMode = vi.fn();
    const open = vi.spyOn(window, "open").mockImplementation(() => null);

    const navigate = commandGroups("prj_1", push, setMode, []).find(
      (group) => group.title === "Navigate",
    );
    const docs = navigate?.items.find((item) => item.label === "Docs & self-hosting");

    expect(docs).toBeDefined();
    docs?.run();

    expect(open).toHaveBeenCalledWith(DOCS_URL, "_blank", "noopener,noreferrer");
    expect(push).not.toHaveBeenCalledWith(DOCS_URL);

    open.mockRestore();
  });

  it("includes the keyword research workspace navigation command", () => {
    const push = vi.fn();
    const navigate = commandGroups("prj_1", push, vi.fn(), []).find(
      (group) => group.title === "Navigate",
    );

    navigate?.items.find((item) => item.label === "Keyword Research")?.run();

    expect(push).toHaveBeenCalledWith("/app/prj_1/keyword-research");
  });

  it("has exact rank tracker labels with concrete hints", () => {
    const actions = commandGroups("prj_1", vi.fn(), vi.fn(), []).find(
      (group) => group.title === "Actions",
    );
    expect(actions).toBeDefined();

    const labels = actions?.items.map((i) => i.label);
    expect(labels).toContain("Rank Tracker: Add keyword");
    expect(labels).toContain("Rank Tracker: Import CSV");
    expect(labels).toContain("Rank Tracker: Export keywords");

    for (const item of actions?.items ?? []) {
      if (item.label.startsWith("Rank Tracker:")) {
        expect(item.hint).not.toBe("Action");
        expect(item.hint.length).toBeGreaterThan(0);
      }
    }
  });

  it("does not include Filter, Run rank checks, or generic Action hints", () => {
    const actions = commandGroups("prj_1", vi.fn(), vi.fn(), []).find(
      (group) => group.title === "Actions",
    );
    expect(actions).toBeDefined();

    const labels = actions?.items.map((i) => i.label);
    expect(labels).not.toContain("Filter");
    expect(labels).not.toContain("Run rank checks");

    const hints = actions?.items.map((i) => i.hint);
    expect(hints).not.toContain("Action");
  });

  it("pushes exact action hrefs for Add, Import, and Export", () => {
    const push = vi.fn();
    const actions = commandGroups("prj_1", push, vi.fn(), []).find(
      (group) => group.title === "Actions",
    );
    expect(actions).toBeDefined();

    const add = actions?.items.find((i) => i.label === "Rank Tracker: Add keyword");
    add?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=add");

    const imp = actions?.items.find((i) => i.label === "Rank Tracker: Import CSV");
    imp?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=import");

    const exp = actions?.items.find((i) => i.label === "Rank Tracker: Export keywords");
    exp?.run();
    expect(push).toHaveBeenCalledWith("/app/prj_1/rank-tracker?action=export");
  });
});
