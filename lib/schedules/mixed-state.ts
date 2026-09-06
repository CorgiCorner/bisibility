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

function uniqueTargets<T extends ScheduleTarget>(targets: readonly T[]): T[] {
  return [...new Map(targets.map((target) => [target.id, target])).values()];
}

export function scheduleRowLabel(targets: readonly ScheduleTarget[]): string {
  const assignments = new Map<string, string>();
  for (const target of uniqueTargets(targets)) {
    const key = target.schedule?.publicId ?? "manual";
    assignments.set(key, target.schedule?.name ?? "Manual");
  }
  if (assignments.size === 0) return "Manual";
  if (assignments.size > 1) return `Mixed - ${assignments.size}`;
  return [...assignments.values()][0] ?? "Manual";
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
