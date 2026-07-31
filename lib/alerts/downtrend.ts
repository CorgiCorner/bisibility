export type AlertTrendCheck = {
  checkedAt?: Date;
  normalizationVersion?: string | null;
  position: number | null;
  rankCheckId?: string | null;
  requestedDepth?: number | null;
};

export type DowntrendSummary = {
  declines: number;
  newest: number;
  oldest: number;
  windowSize: number;
};

function orderedWindow(checks: readonly AlertTrendCheck[]) {
  const ordered = [...checks];
  if (ordered.every((check) => check.checkedAt instanceof Date)) {
    ordered.sort((a, b) => (a.checkedAt?.getTime() ?? 0) - (b.checkedAt?.getTime() ?? 0));
  }
  return ordered.slice(-5);
}

function knownPositionWindow(
  checks: readonly AlertTrendCheck[] | null | undefined,
): number[] | null {
  if (!checks || checks.length < 5) {
    return null;
  }

  const positions: number[] = [];
  for (const { position } of orderedWindow(checks)) {
    if (typeof position !== "number" || !Number.isFinite(position)) {
      return null;
    }
    positions.push(position);
  }
  return positions.length === 5 ? positions : null;
}

export function downtrendStateKnown(checks: readonly AlertTrendCheck[] | null | undefined) {
  return knownPositionWindow(checks) !== null;
}

export function downtrendSummary(
  checks: readonly AlertTrendCheck[] | null | undefined,
): DowntrendSummary | null {
  const numeric = knownPositionWindow(checks);
  if (!numeric) {
    return null;
  }

  const declines = numeric.slice(1).filter((position, index) => position > numeric[index]).length;
  const oldest = numeric[0];
  const newest = numeric[4];

  return declines >= 3 && newest > oldest ? { declines, newest, oldest, windowSize: 5 } : null;
}

export function hasDowntrend(checks: readonly AlertTrendCheck[] | null | undefined) {
  return downtrendSummary(checks) !== null;
}
