import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";

/**
 * Shared HTML table-header class vocabulary. Every HTML table header and its
 * matching loading skeleton apply this class so the background token, muted
 * text, Sans family, 10px size, eyebrow tracking, and two-sided border stay in
 * lockstep.
 */
export const tableHeaderTypographyClassName = metricEyebrowClassName;

// A header owns both rules unless a surrounding frame already draws its top edge.
export const tableHeaderBorderClassName = "border-y border-border";
export const tableHeaderFrameBorderClassName = "border-b border-t-0 border-border";

/**
 * The head treatment for dense grids uses the surface below the transparent
 * background token and a shared top and bottom rule.
 */
export const tableHeaderClassName = `${tableHeaderBorderClassName} bg-table-header-bg ${tableHeaderTypographyClassName}`;
