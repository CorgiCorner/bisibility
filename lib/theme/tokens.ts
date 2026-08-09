export const colorTokenNames = [
  "bg",
  "bg-elev",
  "bg-sidebar",
  "bg-sunken",
  "bg-inset",
  "fg",
  "fg-muted",
  "border",
  "border-soft",
  "border-strong",
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
 * The primary button carries a light label, so its surface cannot be the brand --accent
 * (#D97757 reaches only ~3.0:1 against a near-white label). --accent-solid is the same hue
 * and saturation held at a darker lightness, which is the smallest move that clears AA;
 * --accent keeps its original value for tints, borders and decorative fills.
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
    bg: "#F2EEE4",
    "bg-elev": "#FBF9F4",
    "bg-sidebar": "#FFFFFF",
    "bg-sunken": "#ECE7DB",
    "bg-inset": "#E2DDD0",
    fg: "#1A1813",
    "fg-muted": "#615B4D",
    border: "#BFB7A4",
    "border-soft": "#F0EEE6",
    "border-strong": "#867B68",
    "nav-active": "#EDEAE1",
    // Meter/progress tracks need contrast against the surface they sit on, not depth.
    // Recessed fills (--bg-sunken, --bg-inset) go darker than --bg in dark mode, which
    // makes a track on the page background invisible; this token stays on the visible
    // side of the surface in both schemes. Light shares --bg-inset's value.
    "meter-track": "#E2DDD0",
    accent: "#D97757",
    "accent-hover": "#C8643F",
    "accent-text": "#9F4528",
    "accent-soft": "#F7E8E0",
    // hsl(15 63% 44%) - brand hue/saturation, 16 lightness points below --accent.
    "accent-solid": "#B74C29",
    // hsl(15 63% 42%) - one step darker again.
    "accent-solid-hover": "#AF4927",
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
    "bg-elev": "#1B1810",
    "bg-sidebar": "#070603",
    "bg-sunken": "#15110A",
    "bg-inset": "#080704",
    fg: "#ECE7DB",
    "fg-muted": "#9F998A",
    border: "#463D2E",
    "border-soft": "#221D15",
    "border-strong": "#716653",
    "nav-active": "#231F17",
    // Sits in --border's band (1.8:1 against --bg, matching the hairlines the dark theme
    // already renders as visible), so the track separates from --bg (#0F0C07) and
    // --bg-elev (#1B1810) alike instead of vanishing the way recessed fills do.
    "meter-track": "#443C29",
    accent: "#E08A6A",
    "accent-hover": "#EC9A7C",
    "accent-text": "#F0A18A",
    "accent-soft": "#2A2018",
    // hsl(16 66% 44%) - dark-accent hue/saturation. Measured against #FFF3EE, 44% is the
    // lightest step that clears AA (45% lands at 4.42:1) while the surface still separates
    // from --bg at 3.94:1.
    "accent-solid": "#BA4F27",
    // hsl(16 66% 42%) - one step darker again.
    "accent-solid-hover": "#B14B25",
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
