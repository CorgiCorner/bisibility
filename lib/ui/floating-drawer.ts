import {
  MOTION_DRAWER_EXIT,
  MOTION_FLOATING_DRAWER_ENTER,
  MOTION_FLOATING_SHEET_ENTER,
} from "@/lib/ui/motion";

/** Tailwind `sm`. A floating panel at and above this width; a bottom sheet below. */
export const FLOATING_DRAWER_DESKTOP_QUERY = "(min-width: 640px)";

export type FloatingDrawerPlacement = "panel" | "sheet";

/**
 * Drag distance that commits a bottom-sheet close.
 * 4rem (Tailwind spacing 16 / `h-16`) at the default 16px root.
 */
export const FLOATING_DRAWER_SWIPE_CLOSE_PX = 64;

/** Desktop and mobile panel widths. Form is 560, filters is 440. */
export const FLOATING_DRAWER_WIDTH = {
  filters: 440,
  form: 560,
} as const;

/**
 * Shared chrome. Insets are the spacing scale: `inset-3` is 12px, `inset-2` is 8px.
 * Desktop radius is `rounded-2xl` (16px). The prototype's 22px mobile radius is not
 * on the scale; `rounded-3xl` (24px) is the nearest step.
 * The grab is `h-1.5` (6px) by `w-9` (36px). The prototype's 5px thickness is
 * equidistant from `h-1` (4px); 6px is the larger of those two steps.
 * Elevation is `shadow-2xl`, the strongest default shadow step.
 */
export const FLOATING_DRAWER_FRAME_CLASS =
  "flex min-h-0 flex-col overflow-hidden border border-border bg-bg-elev text-fg shadow-2xl";
export const FLOATING_DRAWER_PANEL_CLASS = "inset-y-3 right-3 rounded-2xl";
export const FLOATING_DRAWER_SHEET_CLASS = "inset-x-2 bottom-2 rounded-3xl";
export const FLOATING_DRAWER_GRAB_CLASS = "h-1.5 w-9 shrink-0 rounded-full bg-border-control";

export function floatingDrawerPlacement(desktop: boolean): FloatingDrawerPlacement {
  return desktop ? "panel" : "sheet";
}

export function floatingDrawerDuration(placement: FloatingDrawerPlacement, reducedMotion: boolean) {
  if (reducedMotion) return { enter: 0, exit: 0 };
  return {
    enter: placement === "sheet" ? MOTION_FLOATING_SHEET_ENTER : MOTION_FLOATING_DRAWER_ENTER,
    exit: MOTION_DRAWER_EXIT,
  };
}

/** Downward drags at or beyond the threshold close. Upward and short drags do not. */
export function floatingDrawerSwipeShouldClose(
  offsetY: number,
  threshold = FLOATING_DRAWER_SWIPE_CLOSE_PX,
): boolean {
  return offsetY >= threshold;
}
