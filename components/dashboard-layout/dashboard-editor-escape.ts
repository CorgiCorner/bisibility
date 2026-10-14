export function canCancelDashboardEditor(
  event: { key: string; defaultPrevented: boolean },
  editing: boolean,
  pending: boolean,
  status: string,
) {
  return (
    event.key === "Escape" &&
    !event.defaultPrevented &&
    editing &&
    !pending &&
    status !== "saving" &&
    status !== "conflict"
  );
}
