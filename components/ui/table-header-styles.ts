import { metricEyebrowClassName } from "@/lib/ui/elevated-surface-styles";

/**
 * Shared HTML table-header class vocabulary. Every HTML table header and its
 * matching loading skeleton apply this class so the background token, muted
 * text, Sans family, 10px size, eyebrow tracking, and two-sided border stay in
 * lockstep.
 */
export const tableHeaderTypographyClassName = metricEyebrowClassName;

/**
 * The head treatment for dense grids uses the surface below the transparent
 * background token and a shared top and bottom rule.
 */
export const tableHeaderClassName = `border-y border-border bg-table-header-bg ${tableHeaderTypographyClassName}`;
