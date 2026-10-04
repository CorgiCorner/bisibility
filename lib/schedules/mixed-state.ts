export type ScheduleReference = Readonly<{
  name: string;
  publicId: string;
}>;

export type ScheduleTarget = Readonly<{
  id: string;
  schedule: ScheduleReference | null;
}>;

export type TargetSelection = Readonly<{
  targetIds: readonly string[];
}>;

export type ScheduleModalCounts = Readonly<{
  selectedTargetCount: number;
  totalTargetCount: number;
}>;

export type ScheduleRowState =
  | Readonly<{ kind: "manual" }>
  | Readonly<{ kind: "mixed"; scheduleCount: number }>
  | Readonly<{ kind: "named"; name: string }>;

function uniqueTargets<T extends ScheduleTarget>(targets: readonly T[]): T[] {
  return [...new Map(targets.map((target) => [target.id, target])).values()];
}

export function scheduleRowState(targets: readonly ScheduleTarget[]): ScheduleRowState {
  const assignments = new Map<string, ScheduleReference | null>();
  for (const target of uniqueTargets(targets)) {
    const key = target.schedule?.publicId ?? "manual";
    assignments.set(key, target.schedule);
  }
  if (assignments.size === 0) return { kind: "manual" };
  if (assignments.size > 1)
    return { kind: "mixed", scheduleCount: [...assignments.values()].filter(Boolean).length };
  const assignment = assignments.values().next().value;
  return assignment ? { kind: "named", name: assignment.name } : { kind: "manual" };
}

/**
 * The grid sorts with the stable legacy values, while its cell translates the visible state.
 * Keeping this separate prevents translated labels from changing ordering or feeding UI logic.
 */
export function scheduleRowSortValue(targets: readonly ScheduleTarget[]): string {
  const state = scheduleRowState(targets);
  if (state.kind === "manual") return "Manual";
  if (state.kind === "mixed") return `Mixed - ${state.scheduleCount}`;
  return state.name;
}

export function scheduleModalCounts(
  targets: readonly ScheduleTarget[],
  selection: TargetSelection,
): ScheduleModalCounts {
  const targetIds = new Set(uniqueTargets(targets).map((target) => target.id));
  const selectedTargetCount = new Set(selection.targetIds.filter((id) => targetIds.has(id))).size;
  return { selectedTargetCount, totalTargetCount: targetIds.size };
}

export function resolveSelectedTarget<T extends ScheduleTarget>(
  targets: readonly T[],
  selectedTargetId: string | null | undefined,
): T | null {
  const unique = uniqueTargets(targets);
  if (selectedTargetId == null) return unique[0] ?? null;
  return unique.find((target) => target.id === selectedTargetId) ?? null;
}
