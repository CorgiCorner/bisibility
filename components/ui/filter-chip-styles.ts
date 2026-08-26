/**
 * Keep filter state visible without competing with primary actions or scope selectors.
 * Solid accent remains reserved for those higher-emphasis controls.
 */
export function filterChipStateClassName(selected: boolean) {
  return selected
    ? "border-border-control bg-accent-soft text-accent-text hover:border-accent focus-visible:border-accent"
    : "border-border-control bg-bg-elev text-fg-muted hover:border-accent hover:text-accent-text focus-visible:border-accent focus-visible:text-accent-text";
}
