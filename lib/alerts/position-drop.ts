export function positionDropAmount(before: number | null, after: number | null) {
  if (before === null || after === null) {
    return null;
  }
  const amount = after - before;
  return amount > 0 ? amount : null;
}

export function hasPositionDrop(
  before: number | null,
  after: number | null,
  dropPositions: number | null | undefined,
) {
  const amount = positionDropAmount(before, after);
  return Boolean(amount !== null && dropPositions && amount >= dropPositions);
}
