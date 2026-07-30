export type ReconcileResult = {
  /** Keyword rows scanned for intent. */
  scanned: number;
  /** Automatic schedules newly created. */
  created: number;
  /** Automatic schedules updated to match intent. */
  updated: number;
  /** Schedules removed (manual/paused keyword or orphaned id). */
  deleted: number;
  /** Per-keyword sync attempts that failed (logged, non-fatal). */
  failed: number;
  /** `rank-check-*` schedules inspected during the prune pass. */
  listed: number;
};
