// Motion token source of truth. The easing strings and millisecond durations
// mirror the CSS custom properties in app/styles/theme-tokens.css. The parity
// is mechanically asserted in lib/ui/motion.test.ts. Durations are plain
// numbers so they slot directly into component transition-duration/timeout
// props; easing strings are valid for both component transitions and inline CSS.

export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";
export const EASE_DRAWER = "cubic-bezier(0.32, 0.72, 0, 1)";

export const MOTION_PRESS = 140;
export const MOTION_TOOLTIP = 150;
export const MOTION_MENU_ENTER = 180;
export const MOTION_MENU_EXIT = 140;
export const MOTION_MODAL_ENTER = 240;
export const MOTION_MODAL_EXIT = 200;
export const MOTION_DRAWER_ENTER = 340;
export const MOTION_DRAWER_EXIT = 280;
export const MOTION_TOAST_ENTER = 200;
export const MOTION_TOAST_EXIT = 150;
