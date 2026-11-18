/** Shipped workspace grid in `workspace-shell.tsx`: expanded 270px, collapsed rail 80px. */
export const SIDEBAR_EXPANDED_PX = 270;
export const SIDEBAR_COLLAPSED_PX = 80;
export const ASSISTANT_PANEL_WIDTH_PX = 420;
/** Floating panel inset (`inset-y-3 right-3` in `lib/ui/floating-drawer.ts`). */
export const ASSISTANT_PANEL_INSET_PX = 12;
/** Page space a docked panel takes: the inset on both sides of the panel plus its width. */
export const ASSISTANT_RESERVE_PX = ASSISTANT_PANEL_WIDTH_PX + 2 * ASSISTANT_PANEL_INSET_PX;
/** Content column floor. Below it the panel overlays instead of squeezing the page. */
export const ASSISTANT_CONTENT_FLOOR_PX = 960;

/** Dock only when sidebar + reserved panel space + the content floor fit. */
export function assistantDockMinViewport(sidebarCollapsed: boolean) {
  const sidebar = sidebarCollapsed ? SIDEBAR_COLLAPSED_PX : SIDEBAR_EXPANDED_PX;
  return sidebar + ASSISTANT_RESERVE_PX + ASSISTANT_CONTENT_FLOOR_PX;
}

export function assistantDockQuery(sidebarCollapsed: boolean) {
  return `(min-width: ${assistantDockMinViewport(sidebarCollapsed)}px)`;
}

export function assistantReservesPage(input: {
  open: boolean;
  viewportWidth: number;
  sidebarCollapsed: boolean;
}) {
  return input.open && input.viewportWidth >= assistantDockMinViewport(input.sidebarCollapsed);
}
