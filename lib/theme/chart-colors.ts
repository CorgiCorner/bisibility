/**
 * MUI d3-color crashes on CSS variables, so series colors must be literal hex values.
 * Keep these synced with globals.css; rendered CSS overrides still provide dark mode.
 */
export const chartColors = {
  accent: "#d97757",
  green: "#3c9a63",
  greenMuted: "#7fb36b",
  yellow: "#e0a93b",
  orange: "#e08a4e",
  blue: "#4f86e8",
  blueText: "#315eac",
  red: "#c8463a",
  border: "#bfb7a4",
} as const;

/**
 * Provider spend-meter segments (HANDOFF-35), assignment order: primary provider,
 * second provider, then cycling orange/blue for further providers.
 */
export const providerSegmentColors = [
  chartColors.accent,
  chartColors.yellow,
  chartColors.orange,
  chartColors.blue,
] as const;

/** CSS-variable fills for rendered spend-meter segments, same order. */
export const providerSegmentCssVars = [
  "var(--accent)",
  "var(--yellow)",
  "var(--rank-bucket-orange)",
  "var(--blue)",
] as const;

/** Rank-quality buckets for the position-distribution chart, best -> worst. */
export const rankBucketColors = [
  chartColors.green, // #1-3
  chartColors.greenMuted, // #4-10
  chartColors.yellow, // #11-20
  chartColors.orange, // #21-50
  chartColors.red, // #51-100
] as const;

/** CSS-variable fills for rendered rank buckets, best -> worst. */
export const rankBucketCssVars = [
  "var(--rank-bucket-green)",
  "var(--rank-bucket-green-muted)",
  "var(--rank-bucket-yellow)",
  "var(--rank-bucket-orange)",
  "var(--rank-bucket-red)",
] as const;
