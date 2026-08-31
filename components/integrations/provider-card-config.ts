export const actionLabels = {
  connected: "Manage",
  needs_reauth: "Reconnect",
  optional: "Connect",
  planned: "Connect",
  ready: "Connect",
} as const;

export const responsiveActionSx = {
  width: "100%",
  "@media (min-width:640px)": { width: "auto" },
} as const;

export const outlineActionSx = {
  ...responsiveActionSx,
  color: "var(--fg-muted)",
  "&:hover": { borderColor: "var(--accent)", color: "var(--accent-text)" },
  "&.Mui-focusVisible": { borderColor: "var(--accent)", color: "var(--accent-text)" },
} as const;

export const reauthCopy: Record<string, string> = {
  gsc: "Google authorization is no longer valid. Reconnect to resume Search Insights and traffic enrichment.",
  ga4: "Google authorization is no longer valid. Reconnect to resume traffic syncs.",
};
