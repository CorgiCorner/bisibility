/** Shared MenuItem pointer/focus fills - matches workspace switcher rows. */
export const menuItemRowHoverSx = {
  "&:hover": { backgroundColor: "var(--bg-sunken)" },
  "&.Mui-focusVisible": { backgroundColor: "var(--bg-sunken)" },
  "&:active": { backgroundColor: "var(--bg-inset)" },
  "&.Mui-selected": { backgroundColor: "transparent" },
} as const;
