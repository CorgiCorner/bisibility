/**
 * Keep filter state visible without competing with primary actions or scope selectors.
 * Solid accent remains reserved for those higher-emphasis controls.
 */
export function filterChipStateClassName(selected: boolean) {
  return selected
    ? "border-border-strong bg-accent-soft text-accent hover:border-accent focus-visible:border-accent"
    : "border-border-strong bg-bg-elev text-fg-muted hover:border-accent hover:text-accent focus-visible:border-accent focus-visible:text-accent";
}
