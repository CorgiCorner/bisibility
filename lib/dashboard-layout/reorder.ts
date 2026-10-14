import { type DashboardDraft, updateDashboardDraft } from "./draft";
import type { WidgetId } from "./types";

export function moveDashboardWidgetTo(
  state: DashboardDraft,
  id: WidgetId,
  target: number,
): DashboardDraft {
  const from = state.draft.widgets.findIndex((widget) => widget.id === id);
  if (
    !Number.isSafeInteger(target) ||
    from === -1 ||
    target < 0 ||
    target >= state.draft.widgets.length
  )
    return state;
  const direction = target < from ? "up" : "down";
  let next = state;
  for (let index = 0; index < Math.abs(target - from); index++)
    next = updateDashboardDraft(next, { type: "move", id, direction });
  return next;
}

/** Row centres use scroll-content coordinates; the dragged row does not count as a slot. */
export function dashboardDropIndex(centres: readonly number[], from: number, y: number): number {
  return centres.filter((centre, index) => index !== from && centre < y).length;
}
