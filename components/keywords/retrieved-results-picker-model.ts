import type { StoredResultsIndexEntry } from "@/lib/checks/contract";

export type PickerRole = "one" | "from" | "to";
export type PickerRow = { entry: StoredResultsIndexEntry; disabledReason: string | null };
export type PickerPreset = { entry: StoredResultsIndexEntry; label: string };

export function retainedLabel(entry: StoredResultsIndexEntry): string {
  return entry.tier === "none" || entry.retrievedPositions === null
    ? "not kept"
    : `top ${entry.retrievedPositions} kept`;
}

export function pickerRows(
  entries: readonly StoredResultsIndexEntry[],
  role: PickerRole,
  selectedFrom?: string,
  selectedTo?: string,
): PickerRow[] {
  const from = entries.find((entry) => entry.checkId === selectedFrom);
  const to = entries.find((entry) => entry.checkId === selectedTo);
  return [...entries]
    .sort((a, b) => b.checkedAt.localeCompare(a.checkedAt))
    .map((entry) => {
      let disabledReason: string | null = null;
      if (entry.tier === "none") disabledReason = "purged by retention";
      else if (role === "to" && entry.checkId === selectedFrom) disabledReason = "selected as From";
      else if (role === "to" && from && entry.checkedAt < from.checkedAt)
        disabledReason = "earlier than From";
      else if (role === "from" && entry.checkId === selectedTo) disabledReason = "selected as To";
      else if (role === "from" && to && entry.checkedAt > to.checkedAt)
        disabledReason = "later than To";
      return { entry, disabledReason };
    });
}

function closestAtOrBefore(
  entries: readonly StoredResultsIndexEntry[],
  target: number,
  predicate: (entry: StoredResultsIndexEntry) => boolean,
) {
  return entries.filter(predicate).sort((a, b) => {
    const ad = Math.abs(target - new Date(a.checkedAt).getTime());
    const bd = Math.abs(target - new Date(b.checkedAt).getTime());
    return ad - bd || b.checkedAt.localeCompare(a.checkedAt);
  })[0];
}

export function fromPresets(
  entries: readonly StoredResultsIndexEntry[],
  selectedTo: string,
): PickerPreset[] {
  const to = entries.find((entry) => entry.checkId === selectedTo);
  if (!to) return [];
  const toTime = new Date(to.checkedAt).getTime();
  const comparable = (entry: StoredResultsIndexEntry) =>
    entry.checkId !== selectedTo &&
    entry.tier !== "none" &&
    new Date(entry.checkedAt).getTime() <= toTime;
  const targets = [
    { label: "Previous check", time: toTime - 1 },
    { label: "30 days ago", time: toTime - 30 * 864e5 },
    { label: "90 days ago", time: toTime - 90 * 864e5 },
  ];
  const used = new Set<string>();
  return targets.flatMap(({ label, time }) => {
    const entry = closestAtOrBefore(
      entries.filter((item) => !used.has(item.checkId)),
      time,
      comparable,
    );
    if (!entry) return [];
    used.add(entry.checkId);
    return [{ entry, label }];
  });
}

export function closestComparable(
  entries: readonly StoredResultsIndexEntry[],
  date: string,
  role: PickerRole,
  selectedFrom?: string,
  selectedTo?: string,
) {
  const target = new Date(`${date}T23:59:59Z`).getTime();
  const rows = pickerRows(entries, role, selectedFrom, selectedTo);
  return closestAtOrBefore(
    rows.map((row) => row.entry),
    target,
    (entry) => rows.find((row) => row.entry.checkId === entry.checkId)?.disabledReason === null,
  );
}
