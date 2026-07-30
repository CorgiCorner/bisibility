import type {
  DispatcherStateCoverage,
  DispatcherStatePageResult,
} from "./dispatcher-state-coverage";

export type DispatcherStateHealPhase = "done" | "heal" | "remove" | "verify";

export type DispatcherStateHealTotals = {
  inserted: number;
  page: number;
  removed: number;
  selected: number;
  skippedLocked: number;
  unchanged: number;
  updated: number;
};

export type DispatcherStateHealCheckpoint = {
  cursor: string | null;
  lastPage: DispatcherStatePageResult | null;
  phase: DispatcherStateHealPhase;
  reconcileAt: string;
  totals: DispatcherStateHealTotals;
  version: 1;
};

export type DispatcherStateHealStore = {
  coverage(now: Date): Promise<DispatcherStateCoverage>;
  heal(options: {
    cursor: string | null;
    dryRun: boolean;
    pageSize: number;
    reconcileAt: Date;
  }): Promise<DispatcherStatePageResult>;
  remove(options: {
    cursor: string | null;
    dryRun: boolean;
    pageSize: number;
  }): Promise<DispatcherStatePageResult>;
};

export type DispatcherStateHealResult = {
  checkpoint: DispatcherStateHealCheckpoint;
  coverage: DispatcherStateCoverage | null;
  hardGateReasons: string[];
  verdict: "INCOMPLETE" | "PASS";
};

const EMPTY_TOTALS: DispatcherStateHealTotals = {
  inserted: 0,
  page: 0,
  removed: 0,
  selected: 0,
  skippedLocked: 0,
  unchanged: 0,
  updated: 0,
};

function addPage(
  checkpoint: DispatcherStateHealCheckpoint,
  page: DispatcherStatePageResult,
): DispatcherStateHealCheckpoint {
  return {
    ...checkpoint,
    cursor: page.cursor,
    lastPage: page,
    totals: {
      inserted: checkpoint.totals.inserted + page.inserted,
      page: checkpoint.totals.page + 1,
      removed: checkpoint.totals.removed + page.removed,
      selected: checkpoint.totals.selected + page.selected,
      skippedLocked: checkpoint.totals.skippedLocked + page.skippedLocked,
      unchanged: checkpoint.totals.unchanged + page.unchanged,
      updated: checkpoint.totals.updated + page.updated,
    },
  };
}

function initialCheckpoint(
  reconcileAt: Date,
  initial?: DispatcherStateHealCheckpoint,
): DispatcherStateHealCheckpoint {
  if (initial) {
    if (initial.version !== 1) throw new Error("Unsupported dispatcher heal checkpoint version.");
    if (initial.reconcileAt !== reconcileAt.toISOString()) {
      throw new Error("Checkpoint reconcileAt does not match the requested reconciliation.");
    }
    return structuredClone(initial);
  }
  return {
    cursor: null,
    lastPage: null,
    phase: "heal",
    reconcileAt: reconcileAt.toISOString(),
    totals: { ...EMPTY_TOTALS },
    version: 1,
  };
}

export async function runDispatcherStateHeal(options: {
  dryRun: boolean;
  initialCheckpoint?: DispatcherStateHealCheckpoint;
  onCheckpoint?: (checkpoint: DispatcherStateHealCheckpoint) => Promise<void>;
  pageSize: number;
  reconcileAt: Date;
  stopAfterBatch?: boolean;
  store: DispatcherStateHealStore;
}): Promise<DispatcherStateHealResult> {
  let checkpoint = initialCheckpoint(options.reconcileAt, options.initialCheckpoint);
  const skippedLockedAtStart = checkpoint.totals.skippedLocked;
  const persist = async () => options.onCheckpoint?.(structuredClone(checkpoint));
  const incomplete = (reasons: string[], coverage: DispatcherStateCoverage | null = null) => ({
    checkpoint,
    coverage,
    hardGateReasons: reasons,
    verdict: "INCOMPLETE" as const,
  });

  while (checkpoint.phase !== "done") {
    if (checkpoint.phase === "heal" || checkpoint.phase === "verify") {
      const phase = checkpoint.phase;
      const page = await options.store.heal({
        cursor: checkpoint.cursor,
        dryRun: options.dryRun,
        pageSize: options.pageSize,
        reconcileAt: options.reconcileAt,
      });
      checkpoint = addPage(checkpoint, page);
      if (page.done) {
        checkpoint = {
          ...checkpoint,
          cursor: null,
          phase: phase === "heal" ? "remove" : "done",
        };
      }
      await persist();
    } else {
      const page = await options.store.remove({
        cursor: checkpoint.cursor,
        dryRun: options.dryRun,
        pageSize: options.pageSize,
      });
      checkpoint = addPage(checkpoint, page);
      if (page.done) {
        checkpoint = {
          ...checkpoint,
          cursor: null,
          phase: options.dryRun ? "done" : "verify",
        };
      }
      await persist();
    }

    if (options.stopAfterBatch && checkpoint.phase !== "done") {
      return incomplete(["stopped-after-batch"]);
    }
  }

  const coverage = await options.store.coverage(options.reconcileAt);
  const reasons: string[] = [];
  if (!coverage.exact) reasons.push("coverage-not-exact");
  if (checkpoint.totals.skippedLocked > skippedLockedAtStart) {
    reasons.push("reconciliation-skipped-locked");
  }
  if (
    options.dryRun &&
    (checkpoint.totals.inserted > 0 ||
      checkpoint.totals.updated > 0 ||
      checkpoint.totals.removed > 0)
  ) {
    reasons.push("dry-run-changes-required");
  }
  await persist();
  return reasons.length === 0
    ? { checkpoint, coverage, hardGateReasons: [], verdict: "PASS" }
    : incomplete(reasons, coverage);
}
