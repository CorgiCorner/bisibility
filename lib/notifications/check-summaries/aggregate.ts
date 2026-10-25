import { isRestoredCheck } from "@/lib/rank-check/restored-check";
import { comparableKey, type MovementCheck, movement } from "./movement";
import { inWindow, persistedWithinCutoff, type SummaryWindow } from "./window";

export type SummaryGroup = "down" | "up" | "failed" | "under_review" | "unchanged" | "new";
export type SummaryCheck = MovementCheck & {
  id: string;
  keywordId: string;
  keywordPublicId: string;
  checkedAt: Date;
  finishedAt: Date | null;
  terminalPersistedAt: Date | null;
  recoveryRestoredAt: Date | null;
  deferredReason: string | null;
  underReview: boolean;
  incidentIds: string[];
};
export type SummaryEntry = {
  checkId: string;
  keywordPublicId: string;
  group: SummaryGroup;
  previous: number | null;
  current: number | null;
  deferredReason: string | null;
};
export type SummaryThresholds = { topN: number; positionMove: number };

const terminal = new Set(["completed", "failed", "deferred"]);
export function eligibleCheck(check: SummaryCheck, end: Date, window?: SummaryWindow) {
  return (
    terminal.has(check.status ?? "") &&
    !isRestoredCheck(check) &&
    persistedWithinCutoff(check.terminalPersistedAt, end) &&
    (!window || inWindow(check, window))
  );
}

export function aggregateChecks(input: {
  checks: readonly SummaryCheck[];
  history: readonly SummaryCheck[];
  end: Date;
  window?: SummaryWindow;
  thresholds: SummaryThresholds;
  deliveredIncidentIds: ReadonlySet<string>;
}) {
  const checks = input.checks
    .filter((c) => eligibleCheck(c, input.end, input.window))
    .sort(compareChecks);
  const history = input.history
    .filter((c) => !isRestoredCheck(c) && !c.underReview)
    .sort(compareChecks)
    .reverse();
  const latest = new Map<string, SummaryCheck>();
  for (const check of checks) {
    const key = comparableKey(check);
    const first = !history.some((c) => c.keywordId === check.keywordId && comparableKey(c) === key);
    if (!check.underReview && (check.comparisonAllowed !== false || first) && key !== null)
      latest.set(check.keywordId, check);
  }
  const entries: SummaryEntry[] = [];
  const counts: Record<SummaryGroup, number> = {
    down: 0,
    up: 0,
    failed: 0,
    under_review: 0,
    unchanged: 0,
    new: 0,
  };
  let significant = false;
  for (const check of checks) {
    let group: SummaryGroup = "unchanged";
    let previous: SummaryCheck | null = null;
    if (check.underReview) {
      group = "under_review";
      if (!check.incidentIds.some((id) => input.deliveredIncidentIds.has(id))) significant = true;
    } else if (check.status === "failed" || check.status === "deferred") {
      group = "failed";
      significant = true;
    } else if (latest.get(check.keywordId) === check) {
      const key = comparableKey(check);
      previous =
        history.find(
          (c) => c.keywordId === check.keywordId && key !== null && comparableKey(c) === key,
        ) ?? null;
      if (!previous) group = "new";
      else {
        const change = movement(check, previous, input.thresholds);
        group = change.direction;
        significant ||= change.significant;
      }
    }
    counts[group]++;
    entries.push({
      checkId: check.id,
      keywordPublicId: check.keywordPublicId,
      group,
      previous: previous?.position ?? null,
      current: check.position,
      deferredReason: check.deferredReason,
    });
  }
  return {
    counts,
    entries,
    significant,
    checkIds: checks.map((c) => c.id),
    incidentIds: [...new Set(checks.flatMap((c) => c.incidentIds))].sort(),
  };
}

function compareChecks(a: SummaryCheck, b: SummaryCheck) {
  return (
    (a.finishedAt ?? a.checkedAt).getTime() - (b.finishedAt ?? b.checkedAt).getTime() ||
    a.checkedAt.getTime() - b.checkedAt.getTime() ||
    a.id.localeCompare(b.id)
  );
}
