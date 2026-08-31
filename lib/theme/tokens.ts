export const colorTokenNames = [
  "bg",
  "bg-elev",
  "bg-sidebar",
  "bg-sunken",
  "bg-band",
  "bg-inset",
  "table-header-bg",
  "fg",
  "fg-muted",
  "border",
  "border-soft",
  "border-control",
  "nav-active",
  "meter-track",
  "accent",
  "accent-hover",
  "accent-text",
  "accent-soft",
  "accent-solid",
  "accent-solid-hover",
  "accent-on-solid",
  "blue",
  "blue-text",
  "purple",
  "green",
  "green-text",
  "red",
  "yellow",
  "yellow-text",
  "red-text",
  "rank-bucket-green",
  "rank-bucket-green-muted",
  "rank-bucket-yellow",
  "rank-bucket-orange",
  "rank-bucket-red",
  "code-bg",
  "code-fg",
  "code-faint",
  "code-border",
] as const;

export type ColorTokenName = (typeof colorTokenNames)[number];
export type ColorSchemeName = "light" | "dark";

/**
 * Primary buttons use the brand fill (#F1511C) in both schemes, with the cream
 * --accent-on-solid label (#FFF3EE). That pair is 3.25:1: above the 3:1 UI-component
 * floor and below 4.5:1 text AA. Dark decorative --accent stays the lighter peach.
 */
export const primaryButtonForegroundTokens = {
  light: "accent-on-solid",
  dark: "accent-on-solid",
} as const satisfies Record<ColorSchemeName, ColorTokenName>;

export const errorButtonForegroundTokens = {
  light: "bg-sidebar",
  dark: "bg",
} as const satisfies Record<ColorSchemeName, ColorTokenName>;

export const colorSchemes = {
  light: {
    bg: "#FCF7ED",
    "bg-elev": "#FBF9F4",
    "bg-sidebar": "#FFFFFF",
    // 30% of #ECE7DB so chips and chrome pick up the parent surface.
    "bg-sunken": "#ECE7DB4D",
    "bg-band": "#F3EEE3",
    "bg-inset": "#E2DDD0",
    "table-header-bg": "#ECE7DB",
    fg: "#1A1813",
    "fg-muted": "#615B4D",
    border: "#DDD8CC",
    "border-soft": "#F0EEE6",
    // Control boundary: inputs, buttons, chips. Deliberately lighter than the
    // 3:1 non-text floor (2.03 on --bg); the exemption is asserted in contrast.test.ts.
    "border-control": "#B1A99A",
    "nav-active": "#EDEAE1",
    // Meter/progress tracks need contrast against the surface they sit on, not depth.
    // Recessed fills (--bg-sunken, --bg-inset) go darker than --bg in dark mode, which
    // makes a track on the page background invisible; this token stays on the visible
    // side of the surface in both schemes. Light shares --bg-inset's value.
    "meter-track": "#E2DDD0",
    accent: "#F1511C",
    "accent-hover": "#F0450F",
    "accent-text": "#AC3A15",
    "accent-soft": "#FAE5DA",
    // Same as --accent in light; the cream --accent-on-solid label is the light pair.
    "accent-solid": "#F1511C",
    // One step darker; cream label is 3.47:1.
    "accent-solid-hover": "#F0450F",
    "accent-on-solid": "#FFF3EE",
    blue: "#4F86E8",
    "blue-text": "#315EAC",
    purple: "#8E6FE0",
    green: "#3C9A63",
    "green-text": "#1F6C40",
    red: "#C8463A",
    yellow: "#E0A93B",
    "yellow-text": "#77580F",
    "red-text": "#B03A2E",
    "rank-bucket-green": "#3C9A63",
    "rank-bucket-green-muted": "#7FB36B",
    "rank-bucket-yellow": "#E0A93B",
    "rank-bucket-orange": "#E08A4E",
    "rank-bucket-red": "#C8463A",
    "code-bg": "#1C1A16",
    "code-fg": "#EDEAE0",
    "code-faint": "#8C887C",
    "code-border": "#33302A",
  },
  dark: {
    bg: "#0F0C07",
    "bg-elev": "#191919",
    "bg-sidebar": "#070603",
    "bg-sunken": "#141414",
    "bg-band": "#141414",
    "bg-inset": "#080704",
    "table-header-bg": "#15110A",
    fg: "#ECE7DB",
    "fg-muted": "#A09D95",
    // --border is the hairline for chrome and decoration. Dark --border-control
    // #616060 is an operator-chosen interactive edge below the WCAG 1.4.11 3:1 floor;
    // contrast.test.ts asserts its narrower floor so further regressions still fail.
    border: "#343333",
    "border-soft": "#221D15",
    "border-control": "#616060",
    "nav-active": "#231F17",
    // Sits in the dark hairline band so the track separates from --bg (#0F0C07) and
    // --bg-elev (#191919) alike instead of vanishing the way recessed fills do.
    "meter-track": "#443C29",
    accent: "#E08A6A",
    "accent-hover": "#EC9A7C",
    "accent-text": "#F0A18A",
    "accent-soft": "#2A2018",
    // Same brand fill as light. Cream-on-brand is 3.25:1, below text AA.
    "accent-solid": "#F1511C",
    "accent-solid-hover": "#F0450F",
    "accent-on-solid": "#FFF3EE",
    blue: "#6A9BF0",
    "blue-text": "#6A9BF0",
    purple: "#9E82E6",
    green: "#57A77E",
    "green-text": "#79C998",
    red: "#E0705C",
    yellow: "#E6B452",
    "yellow-text": "#EEC069",
    "red-text": "#E0705C",
    "rank-bucket-green": "#57A77E",
    "rank-bucket-green-muted": "#8CC07A",
    "rank-bucket-yellow": "#E6B452",
    "rank-bucket-orange": "#EC9A63",
    "rank-bucket-red": "#E0705C",
    "code-bg": "#0E0D0A",
    "code-fg": "#ECE7DB",
    "code-faint": "#7E7A6E",
    "code-border": "#26231E",
  },
} as const satisfies Record<ColorSchemeName, Record<ColorTokenName, `#${string}`>>;

export const tailwindTokenColors = Object.fromEntries(
  colorTokenNames.map((name) => [name, `var(--${name})`]),
) as Record<ColorTokenName, string>;

export const tailwindSemanticColors = {
  ...tailwindTokenColors,
  "error-contrast": "var(--mui-palette-error-contrastText)",
  "primary-contrast": "var(--mui-palette-primary-contrastText)",
} as const;
