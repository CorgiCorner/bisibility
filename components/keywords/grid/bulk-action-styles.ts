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
