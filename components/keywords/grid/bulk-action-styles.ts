import { buttonXsStyle } from "@/components/ui/Button";

export const outlinedSplitChromeStyle = {
  "--control-background-color": "var(--bg-elev)",
  "--control-border": "1px solid var(--border-control)",
  "--control-color": "var(--fg)",
  fontWeight: 600,
  textTransform: "none",
  "--control-hover-background-color": "var(--bg-sunken)",
  "--control-hover-border-color": "var(--border-control)",
} as const;

export const bulkBarButtonStyle = {
  ...buttonXsStyle,
  ...outlinedSplitChromeStyle,
} as const;

/** Destructive outline for the bulk Delete action: red text and border, tinted on hover. */
export const bulkDeleteButtonStyle = {
  "--control-background-color": "transparent",
  "--control-border": "1px solid var(--red)",
  "--control-color": "var(--red)",
  "--control-hover-background-color": "color-mix(in srgb, var(--red) 12%, transparent)",
  "--control-hover-border": "1px solid var(--red)",
  "--control-hover-color": "var(--red)",
} as const;
