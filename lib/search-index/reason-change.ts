export type PresenceStateRow = {
  checkedAt: Date | null;
  coverageState: string | null;
  inspectionError: string | null;
  inspectionFailedAt: Date | null;
  url: string;
  verdict: string | null;
};

export type PresenceChangeRecord = {
  at: Date;
  next: unknown;
  previous: unknown;
  url: string;
};

export type ReasonChangeKind = "decreased" | "increased" | "new" | "unchanged";

export type ReasonCountRow = {
  change: { delta: number; kind: ReasonChangeKind } | null;
  count: number;
  coverageState: string;
};

type Snap = { coverageState: string | null; verdict: string | null };

function snap(value: unknown): Snap | "empty" | "invalid" {
  if (value == null) return "empty";
  if (typeof value !== "object" || Array.isArray(value)) return "invalid";
  const record = value as Record<string, unknown>;
  if (Object.keys(record).length === 0) return "empty";
  const verdict = record.verdict;
  const coverageState = record.coverageState;
  if (verdict != null && typeof verdict !== "string") return "invalid";
  if (coverageState != null && typeof coverageState !== "string") return "invalid";
  return {
    coverageState: typeof coverageState === "string" ? coverageState : null,
    verdict: typeof verdict === "string" ? verdict : null,
  };
}

function notIndexedCoverage(value: Snap) {
  if (value.verdict === "PASS") return null;
  return value.coverageState;
}

function isNotIndexed(row: PresenceStateRow) {
  return row.inspectionError == null && row.checkedAt != null && row.verdict !== "PASS";
}

function priorCoverage(
  row: PresenceStateRow | undefined,
  changes: readonly PresenceChangeRecord[],
  cutoff: Date,
): string | null | "invalid" {
  const first = changes.find((change) => change.at > cutoff);
  if (first) {
    const prior = snap(first.previous);
    if (prior === "invalid") return "invalid";
    if (prior === "empty") return null;
    return notIndexedCoverage(prior);
  }
  if (!row?.checkedAt || row.checkedAt > cutoff) return null;
  const failedLater =
    row.inspectionError != null &&
    row.inspectionFailedAt != null &&
    row.inspectionFailedAt > cutoff;
  if (row.inspectionError != null && !failedLater) return null;
  if (row.verdict === "PASS") return null;
  return row.coverageState;
}

function changeFor(current: number, previous: number): ReasonCountRow["change"] {
  const delta = current - previous;
  if (previous === 0 && current > 0) return { delta, kind: "new" };
  if (delta === 0) return { delta: 0, kind: "unchanged" };
  if (delta > 0) return { delta, kind: "increased" };
  return { delta, kind: "decreased" };
}

/**
 * Per-reason movement against the count 7 days ago.
 * `PageIndexingDay` stores only aggregate totals, so a reason delta comes from
 * `UrlPresenceChange` plus the current presence rows. Invalid history omits it.
 */
export function reasonCountRows(input: {
  changes: readonly PresenceChangeRecord[];
  cutoff: Date;
  rows: readonly PresenceStateRow[];
}): { derived: boolean; rows: ReasonCountRow[] } {
  const changesByUrl = new Map<string, PresenceChangeRecord[]>();
  for (const change of input.changes) {
    const list = changesByUrl.get(change.url) ?? [];
    list.push(change);
    changesByUrl.set(change.url, list);
  }
  for (const list of changesByUrl.values()) {
    list.sort((a, b) => a.at.getTime() - b.at.getTime());
  }

  const current = new Map<string, number>();
  const previous = new Map<string, number>();
  const seen = new Set<string>();
  let derived = true;

  const addPrevious = (coverage: string | null | "invalid") => {
    if (coverage === "invalid") {
      derived = false;
      return;
    }
    if (!coverage) return;
    previous.set(coverage, (previous.get(coverage) ?? 0) + 1);
  };

  for (const row of input.rows) {
    seen.add(row.url);
    if (isNotIndexed(row) && row.coverageState) {
      current.set(row.coverageState, (current.get(row.coverageState) ?? 0) + 1);
    }
    addPrevious(priorCoverage(row, changesByUrl.get(row.url) ?? [], input.cutoff));
  }

  for (const [url, changes] of changesByUrl) {
    if (seen.has(url)) continue;
    addPrevious(priorCoverage(undefined, changes, input.cutoff));
  }

  const rows = [...current.entries()]
    .map(([coverageState, count]) => ({
      change: derived ? changeFor(count, previous.get(coverageState) ?? 0) : null,
      count,
      coverageState,
    }))
    .sort((a, b) => b.count - a.count || a.coverageState.localeCompare(b.coverageState));

  return { derived, rows };
}
