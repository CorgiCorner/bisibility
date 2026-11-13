import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FLOATING_DRAWER_DESKTOP_QUERY,
  FLOATING_DRAWER_FRAME_CLASS,
  FLOATING_DRAWER_GRAB_CLASS,
  FLOATING_DRAWER_PANEL_CLASS,
  FLOATING_DRAWER_SHEET_CLASS,
  FLOATING_DRAWER_SWIPE_CLOSE_PX,
  FLOATING_DRAWER_WIDTH,
  floatingDrawerDuration,
  floatingDrawerPlacement,
  floatingDrawerSwipeShouldClose,
} from "./floating-drawer";
import {
  MOTION_DRAWER_EXIT,
  MOTION_FLOATING_DRAWER_ENTER,
  MOTION_FLOATING_SHEET_ENTER,
} from "./motion";

describe("floating drawer swipe threshold", () => {
  it("closes once the drag reaches the threshold", () => {
    expect(floatingDrawerSwipeShouldClose(FLOATING_DRAWER_SWIPE_CLOSE_PX)).toBe(true);
    expect(floatingDrawerSwipeShouldClose(FLOATING_DRAWER_SWIPE_CLOSE_PX + 40)).toBe(true);
  });

  it("keeps a short or upward drag open", () => {
    expect(floatingDrawerSwipeShouldClose(FLOATING_DRAWER_SWIPE_CLOSE_PX - 1)).toBe(false);
    expect(floatingDrawerSwipeShouldClose(0)).toBe(false);
    expect(floatingDrawerSwipeShouldClose(-24)).toBe(false);
  });

  it("honours an explicit threshold", () => {
    expect(floatingDrawerSwipeShouldClose(10, 10)).toBe(true);
    expect(floatingDrawerSwipeShouldClose(9, 10)).toBe(false);
  });
});

describe("floating drawer geometry", () => {
  it("uses the sm breakpoint for the floating panel", () => {
    expect(FLOATING_DRAWER_DESKTOP_QUERY).toBe("(min-width: 640px)");
    expect(floatingDrawerPlacement(true)).toBe("panel");
    expect(floatingDrawerPlacement(false)).toBe("sheet");
  });

  it("keeps the form and filters widths", () => {
    expect(FLOATING_DRAWER_WIDTH).toEqual({ filters: 440, form: 560 });
  });

  it("describes a floating panel from the spacing and radius scale", () => {
    expect(FLOATING_DRAWER_FRAME_CLASS).toContain("shadow-2xl");
    expect(FLOATING_DRAWER_FRAME_CLASS).toContain("border");
    expect(FLOATING_DRAWER_PANEL_CLASS).toContain("inset-y-3");
    expect(FLOATING_DRAWER_PANEL_CLASS).toContain("right-3");
    expect(FLOATING_DRAWER_PANEL_CLASS).toContain("rounded-2xl");
    expect(FLOATING_DRAWER_SHEET_CLASS).toContain("inset-x-2");
    expect(FLOATING_DRAWER_SHEET_CLASS).toContain("bottom-2");
    // Prototype radius is 22px. rounded-3xl is 24px, the nearest scale step.
    expect(FLOATING_DRAWER_SHEET_CLASS).toContain("rounded-3xl");
    expect(FLOATING_DRAWER_GRAB_CLASS).toContain("h-1.5");
    expect(FLOATING_DRAWER_GRAB_CLASS).toContain("w-9");
  });

  it("uses a 260ms panel enter, a 300ms sheet enter, and no motion when reduced", () => {
    expect(floatingDrawerDuration("panel", false)).toEqual({
      enter: MOTION_FLOATING_DRAWER_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
    expect(MOTION_FLOATING_DRAWER_ENTER).toBe(260);
    expect(floatingDrawerDuration("sheet", false)).toEqual({
      enter: MOTION_FLOATING_SHEET_ENTER,
      exit: MOTION_DRAWER_EXIT,
    });
    expect(MOTION_FLOATING_SHEET_ENTER).toBe(300);
    expect(floatingDrawerDuration("panel", true)).toEqual({ enter: 0, exit: 0 });
    expect(floatingDrawerDuration("sheet", true)).toEqual({ enter: 0, exit: 0 });
  });

  it("keeps the left-edge drawer motion and adds the floating offset in the shared surface", () => {
    const css = readFileSync(resolve(import.meta.dirname, "dialog-surface.module.css"), "utf8");
    expect(css).toContain("--panel-offset: translateX(-100%)");
    expect(css).toContain("--panel-offset: translateY(100%)");
    expect(css).toContain("--panel-offset: translateX(1rem)");
    expect(css).toContain("--panel-ease: var(--ease-out)");
    expect(css).toContain(
      "animation: panel-enter var(--enter-duration) var(--panel-ease, var(--ease-drawer))",
    );
    expect(css).toContain('[data-placement="sheet"] footer > button');
    expect(css).toContain("flex: 1 1 0");
    expect(css).toContain("min-width: 0");
    expect(css).toContain("white-space: nowrap");
    expect(css).not.toContain("flex: 1 1 auto");
  });
});
