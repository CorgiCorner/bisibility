/** Geometry and flip math for the workspace switcher menu. Kept pure so the placement
 * decision is unit-tested without a layout engine. */

/** Distance between the trigger edge and the menu. */
export const WORKSPACE_MENU_OFFSET = 6;
/** Minimum breathing room the menu must keep from the top of the viewport. */
export const WORKSPACE_MENU_VIEWPORT_MARGIN = 8;
export const WORKSPACE_MENU_WIDTH = 248;
/** The collapsed rail is 80px wide; a 248px popover laid over it would swallow the column. */
export const WORKSPACE_MENU_RAIL_GAP = 10;

// Menu chrome: 6px padding plus a 1px border, top and bottom.
const PAPER_FRAME = 14;
// "Projects" label: 10px top, 7px bottom, ~15px of mono line box.
const SECTION_LABEL = 32;
// 8px padding + a name and a meta line + 8px padding, plus the row's 4px bottom margin.
const WORKSPACE_ROW = 52;
// 8px padding + a 30px leading slot + 8px padding, plus the row's 4px bottom margin.
const ACTION_ROW = 50;
// 1px rule with a 4px margin above and below, plus the list-item line box it sits in.
const DIVIDER = 13;

export type WorkspaceMenuPlacement = "up" | "down";

export type WorkspaceMenuOrigins = {
  anchorOrigin: { horizontal: "left" | "right"; vertical: "bottom" | "top" };
  transformOrigin: { horizontal: "left" | "right"; vertical: "bottom" | "top" };
  offset: { marginLeft: string; marginTop: string };
};

/** First-open estimate, used until a real render has been measured. */
export function estimateWorkspaceMenuHeight(workspaceCount: number, actionCount: number): number {
  return (
    PAPER_FRAME +
    SECTION_LABEL +
    DIVIDER +
    workspaceCount * WORKSPACE_ROW +
    actionCount * ACTION_ROW
  );
}

/**
 * The trigger sits at the foot of a full-height column, so the menu opens upward by
 * default and flips down only when opening upward would clear the top of the viewport.
 */
export function resolveWorkspaceMenuPlacement(
  triggerTop: number,
  menuHeight: number,
): WorkspaceMenuPlacement {
  const upwardTop = triggerTop - menuHeight - WORKSPACE_MENU_OFFSET;
  return upwardTop < WORKSPACE_MENU_VIEWPORT_MARGIN ? "down" : "up";
}

/**
 * Expanded: the menu stacks above (or below) the trigger, 6px away. Collapsed: it opens
 * BESIDE the rail, aligned to the trigger's bottom edge, or its top edge when flipped.
 */
export function workspaceMenuOrigins(
  collapsed: boolean,
  placement: WorkspaceMenuPlacement,
): WorkspaceMenuOrigins {
  if (collapsed) {
    const vertical = placement === "up" ? "bottom" : "top";
    return {
      anchorOrigin: { horizontal: "right", vertical },
      transformOrigin: { horizontal: "left", vertical },
      offset: { marginLeft: `${WORKSPACE_MENU_RAIL_GAP}px`, marginTop: "0px" },
    };
  }

  if (placement === "up") {
    return {
      anchorOrigin: { horizontal: "left", vertical: "top" },
      transformOrigin: { horizontal: "left", vertical: "bottom" },
      offset: { marginLeft: "0px", marginTop: `-${WORKSPACE_MENU_OFFSET}px` },
    };
  }

  return {
    anchorOrigin: { horizontal: "left", vertical: "bottom" },
    transformOrigin: { horizontal: "left", vertical: "top" },
    offset: { marginLeft: "0px", marginTop: `${WORKSPACE_MENU_OFFSET}px` },
  };
}
