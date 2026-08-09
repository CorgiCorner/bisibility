import {
  estimateWorkspaceMenuHeight,
  resolveWorkspaceMenuPlacement,
  workspaceMenuOrigins,
} from "@/components/shell/workspace-menu-placement";
import { describe, expect, it } from "vitest";

describe("resolveWorkspaceMenuPlacement", () => {
  it("opens upward when the menu clears the top of the viewport", () => {
    expect(resolveWorkspaceMenuPlacement(700, 300)).toBe("up");
  });

  it("flips downward when opening upward would land above the 8px margin", () => {
    expect(resolveWorkspaceMenuPlacement(300, 300)).toBe("down");
  });

  it("treats the margin as the boundary", () => {
    // 300 - 286 - 6 = 8, exactly the margin, so upward still fits.
    expect(resolveWorkspaceMenuPlacement(300, 286)).toBe("up");
    expect(resolveWorkspaceMenuPlacement(300, 287)).toBe("down");
  });
});

describe("estimateWorkspaceMenuHeight", () => {
  it("grows with every row", () => {
    expect(estimateWorkspaceMenuHeight(4, 2) - estimateWorkspaceMenuHeight(3, 2)).toBe(52);
    expect(estimateWorkspaceMenuHeight(3, 2) - estimateWorkspaceMenuHeight(3, 1)).toBe(50);
  });

  it("lands within a few px of the rendered menu", () => {
    // Three workspaces plus settings and create measures 315.5px in the browser.
    expect(estimateWorkspaceMenuHeight(3, 2)).toBe(315);
  });
});

describe("workspaceMenuOrigins", () => {
  it("stacks the expanded menu above the trigger with a 6px gap", () => {
    const { anchorOrigin, offset, transformOrigin } = workspaceMenuOrigins(false, "up");
    expect(anchorOrigin).toEqual({ horizontal: "left", vertical: "top" });
    expect(transformOrigin).toEqual({ horizontal: "left", vertical: "bottom" });
    expect(offset).toEqual({ marginLeft: "0px", marginTop: "-6px" });
  });

  it("drops the expanded menu below the trigger when flipped", () => {
    const { anchorOrigin, offset, transformOrigin } = workspaceMenuOrigins(false, "down");
    expect(anchorOrigin).toEqual({ horizontal: "left", vertical: "bottom" });
    expect(transformOrigin).toEqual({ horizontal: "left", vertical: "top" });
    expect(offset).toEqual({ marginLeft: "0px", marginTop: "6px" });
  });

  it("opens beside the collapsed rail, aligned to the trigger's bottom", () => {
    const { anchorOrigin, offset, transformOrigin } = workspaceMenuOrigins(true, "up");
    expect(anchorOrigin).toEqual({ horizontal: "right", vertical: "bottom" });
    expect(transformOrigin).toEqual({ horizontal: "left", vertical: "bottom" });
    expect(offset.marginLeft).toBe("10px");
  });

  it("keeps the collapsed menu beside the rail when flipped, aligned to the top", () => {
    const { anchorOrigin, transformOrigin } = workspaceMenuOrigins(true, "down");
    expect(anchorOrigin).toEqual({ horizontal: "right", vertical: "top" });
    expect(transformOrigin).toEqual({ horizontal: "left", vertical: "top" });
  });
});
