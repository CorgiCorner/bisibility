export function mergeTrackingRows<T extends { id: string }>(
  before: readonly T[],
  after: readonly T[],
) {
  const rows = new Map(before.map((row) => [row.id, row]));
  for (const row of after) rows.set(row.id, row);
  return [...rows.values()];
}
