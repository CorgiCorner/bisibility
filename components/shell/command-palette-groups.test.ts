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
});
